import ModelForecast from '@/models/ModelForecast';
import ModelReport from '@/models/ModelReport';
import Pick from '@/models/Pick';
import Coupon from '@/models/Coupon';
import User from '@/models/User';
import { getTransporter } from '@/lib/mailer';
import { MODEL_VERSION } from '@/lib/model';
import { shotsConfig } from '@/lib/model/shotStrength';
import { buildCandidate, decideCalibration, hintSamples } from '@/lib/model/weeklyCalibration';
import { activateCalibration, currentCalibration, PROD_SCOPE } from '@/lib/model/chanceCalibrationStore';
import { buildWeeklySummary, formatWeeklyReport } from '@/lib/model/weeklyReport';
import { PUBLIC_COUPON_TYPES } from '@/lib/coupons/build';

/**
 * ZADANIE TYGODNIOWE: kalibracja z bezpiecznikami + raport mailem do administratora.
 *
 * Woła je harmonogram z `server.js` (poniedziałek 6:30 czasu polskiego — po nocnym rozliczeniu
 * dziennika o 3:00 i typów o 4:00 czasu serwera, przed porannym mailem o 8:00) przez
 * `/api/cron/model-weekly`. Zero zapytań do dostawcy i do AI — wyłącznie baza.
 *
 * PAMIĘĆ (serwer ma 512 MB): czytamy tylko potrzebne pola. Kalibracja — plakietki z ostatnich
 * `CALIBRATION_WEEKS` tygodni (~200 bajtów na wiersz; przy ~1000 plakietek tygodniowo to kilka MB),
 * liczby raportu — dziennik z 28 dni (~3 000 meczów), typy i kupony z 28 dni.
 */

/** Okno plakietek do kalibracji: pół roku — starsze mówią o modelu, którego już nie ma. */
export const CALIBRATION_WEEKS = 26;
const DZIEN = 86_400_000;

/** Adresy administratorów — ci sami, którzy dostają post na X w porannym mailu. */
async function adminEmails() {
	const admini = await User.find({ role: 'admin', email: { $ne: null } }).select('email').lean();
	return [...new Set(admini.map((u) => u.email).filter(Boolean))];
}

/**
 * Jeden przebieg.
 *
 * @param {{ now?: Date, dryRun?: boolean, scope?: string, send?: boolean }} [options]
 *   `dryRun` — liczy i zwraca raport, niczego nie włącza, nie zapisuje i nie wysyła;
 *   `scope` — przestrzeń wersji korekty i raportów (testy używają własnej, nigdy `prod`)
 * @returns {Promise<{ reportId: string|null, subject: string, text: string, summary: object, activated: string|null, emailedTo: number, problems: string[] }>}
 */
export async function runWeeklyModelJob({ now = new Date(), dryRun = false, scope = PROD_SCOPE, send = true } = {}) {
	const problems = [];
	const od28 = new Date(now.getTime() - 28 * DZIEN);
	const odKalibracji = new Date(now.getTime() - CALIBRATION_WEEKS * 7 * DZIEN);

	const [plakietki, forecasts, picks, coupons] = await Promise.all([
		ModelForecast.find({ 'hint.key': { $ne: null }, 'result.home': { $ne: null }, kickoff: { $gte: odKalibracji, $lte: now } })
			.select('kickoff hint.key hint.raw hint.probability result.home result.away')
			.sort({ kickoff: 1 })
			.lean(),
		ModelForecast.find({ 'result.home': { $ne: null }, kickoff: { $gte: od28, $lte: now } })
			.select('kickoff markets over25.base hint.key odds.open odds.close result.home result.away strength modelVersion')
			.lean(),
		Pick.find({ kind: 'hint', countsToStats: true, status: { $in: ['won', 'lost'] }, settledAt: { $gte: od28, $lte: now } })
			.select('probability status settledAt')
			.lean(),
		Coupon.find({ type: { $in: PUBLIC_COUPON_TYPES }, status: { $in: ['won', 'lost'] }, settledAt: { $gte: od28, $lte: now } })
			.select('type status totalOdds settledAt')
			.lean(),
	]);

	// 1. Kalibracja: kandydat, decyzja przez bezpieczniki, włączenie (tylko gdy coś się zmienia).
	const active = await currentCalibration({ scope });
	const candidate = buildCandidate(plakietki, { now });
	const decision = decideCalibration({ candidate, active, samples: hintSamples(plakietki) });
	let activated = null;
	let activatedDoc = null;
	if (decision.changed && !dryRun) {
		try {
			activatedDoc = await activateCalibration(decision.data, { scope, previousVersion: active?.version ?? null, now });
			activated = activatedDoc.version;
		} catch (error) {
			problems.push(`wlaczenie_korekty: ${error.message}`);
		}
	}

	// 2. Raport.
	const summary = buildWeeklySummary({
		forecasts,
		picks,
		coupons,
		decision,
		active,
		activated,
		model: { version: MODEL_VERSION, shots: shotsConfig() },
		now,
	});
	const { subject, text } = formatWeeklyReport(summary);
	if (dryRun) return { reportId: null, subject, text, summary, activated: null, emailedTo: 0, problems };

	const raport = await ModelReport.create({
		scope,
		at: now,
		from: new Date(now.getTime() - 7 * DZIEN).toISOString().slice(0, 10),
		to: now.toISOString().slice(0, 10),
		summary,
		calibration: {
			changed: Boolean(activated),
			activated,
			previous: active?.version ?? null,
			selections: decision.selections,
			reasons: decision.reasons,
		},
		subject,
		text,
	});
	if (activatedDoc) {
		const ChanceCalibration = (await import('@/models/ChanceCalibration')).default;
		await ChanceCalibration.updateOne({ _id: activatedDoc._id }, { $set: { reportId: raport._id } });
	}

	// 3. Mail do administratorów — porażka wysyłki nie cofa kalibracji ani raportu (jest w panelu).
	let emailedTo = 0;
	if (send) {
		try {
			const adresy = await adminEmails();
			const transporter = adresy.length ? getTransporter() : null;
			for (const to of adresy) {
				await transporter.sendMail({ from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`, to, subject, text });
				emailedTo += 1;
			}
		} catch (error) {
			problems.push(`mail: ${error.message}`);
		}
	}
	if (emailedTo || problems.length) await ModelReport.updateOne({ _id: raport._id }, { $set: { emailedTo, problems } });

	return { reportId: String(raport._id), subject, text, summary, activated, emailedTo, problems };
}

/** Historia raportów do panelu administratora — najnowsze pierwsze, bez ciężkich pól. */
export async function weeklyReportHistory({ scope = PROD_SCOPE, limit = 12 } = {}) {
	return ModelReport.find({ scope }).sort({ at: -1 }).limit(limit).select('at from to subject text calibration emailedTo problems').lean();
}
