import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { snapshotOdds } from '@/lib/model/oddsShadowJob';
import { ensureCoupons, settleCoupons } from '@/lib/coupons/service';
import { settleValuePicks } from '@/lib/value/service';
import { snapshotLineups } from '@/lib/football/lineupsJob';

export const maxDuration = 600;

/**
 * Tryb cienia „kurs ≥ 1,50" — kursy do dziennika prognoz (`lib/model/oddsShadowJob.js`).
 *
 * Ten sam sekret, co pozostałe zadania; woła je harmonogram z `server.js` co 20 minut.
 * `?budget=N` ogranicza liczbę zapytań do dostawcy w jednym przebiegu (domyślnie 250).
 *
 * Po kursach ten sam przebieg składa kupony dnia, 3- i 5-dniowy (od 9:30), i rozlicza
 * typy kuponów po meczach (`lib/coupons/service.js`). Każda część ma własny `try` — błąd
 * kuponu nie może zabrać zdjęcia kursów i odwrotnie.
 *
 * SKŁADY I NIEOBECNI (od 22.11.2026, `lib/football/lineupsJob.js`) — NA KOŃCU przebiegu, po kuponach: kupony
 * i rozliczenia nie czekają na składy (harmonogram przerywa wywołanie po 5 minutach), a weto o 9:30 i tak ma listę
 * nieobecnych z wcześniejszych przebiegów (mecze najbliższych 30 godzin, odświeżane co 6 godzin). Świeżo
 * opublikowane nogi są w tym samym przebiegu już „pilne". Własny budżet (40 zapytań na przebieg, 600 na dzień)
 * i własny `try`.
 */
export async function POST(request) {
	const expected = process.env.INTERNAL_API_SECRET || '';
	const provided = request.headers.get('x-internal-secret') || '';
	if (!expected) return Response.json({ error: 'internal_secret_not_configured' }, { status: 503 });

	const a = Buffer.from(expected);
	const b = Buffer.from(provided);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const budget = Number(new URL(request.url).searchParams.get('budget'));

	try {
		await connectToDb();
		const summary = await snapshotOdds(Number.isInteger(budget) && budget > 0 ? { budget } : {});
		const coupons = {};
		try {
			Object.assign(coupons, await ensureCoupons());
		} catch (error) {
			console.error('[coupons] wybór kuponów nie powiódł się:', error.message);
			coupons.error = 'build_failed';
		}
		try {
			coupons.settled = (await settleCoupons()).settled;
		} catch (error) {
			console.error('[coupons] rozliczenie kuponów nie powiodło się:', error.message);
			coupons.error = 'settle_failed';
		}
		// Typy z wyższym kursem (asystent, raport) — rozliczane tym samym rytmem co kupony.
		try {
			coupons.valueSettled = (await settleValuePicks()).settled;
		} catch (error) {
			console.error('[value] rozliczenie typów z wyższym kursem nie powiodło się:', error.message);
			coupons.error = 'value_settle_failed';
		}
		let lineups;
		try {
			lineups = await snapshotLineups();
			if (lineups?.budget?.used) {
				console.log(
					`[lineups] cele ${lineups.targets} (pilne ${lineups.priority}), składy ${lineups.lineups}, nieobecni ${lineups.injuries}, ` +
						`historia ${lineups.history}, miara ${lineups.measured}, ostrzeżenia ${lineups.warnings} — zapytań ${lineups.budget.used}, dziś ${lineups.budget.usedToday}/${lineups.budget.perDay}`
				);
			}
		} catch (error) {
			console.error('[lineups] przebieg nie powiódł się:', error.message);
			lineups = { error: 'lineups_failed' };
		}
		return Response.json({ ok: true, ...summary, lineups, coupons });
	} catch (error) {
		console.error('[odds-shadow] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'odds_snapshot_failed' }, { status: 500 });
	}
}
