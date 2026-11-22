import Pick from '@/models/Pick';
import ModelForecast from '@/models/ModelForecast';
import RegisterOdds from '@/models/RegisterOdds';
import {
	CLOSE_WINDOW_MS,
	fetchOddsSnapshot,
	OPEN_MIN_LEAD_MS,
	openWindowEnd,
} from '@/lib/model/oddsShadowJob';
import { REGISTER_QUERY } from '@/lib/trust/register';

/**
 * Kursy dla rejestru typów tam, gdzie dziennik prognoz ich nie zdejmie. Woła je ten sam przebieg
 * co dziennik (`/api/cron/odds-snapshot`, co 20 minut), zaraz po nim — więc widzi już jego
 * świeże zdjęcia i nie pyta o to samo drugi raz.
 *
 * TRZY PRZYPADKI, wszystkie tylko dla typów rejestru (`REGISTER_QUERY`) czekających na mecz:
 *   open   mecz bez dziennika — rano, w tym samym oknie co dziennik (od godziny do 9:00 jutro);
 *   close  mecz bez dziennika — 10–30 minut przed meczem;
 *   after  typ zapisany, gdy poranne zdjęcie już było (analiza otwarta po południu) albo gdy
 *          mecz jest za blisko na okno poranne — zdjęcie z chwili publikacji (do 20 minut po).
 *          Bez niego taki typ porównywalibyśmy z kursem sprzed publikacji (patrz `lib/trust/register`).
 *          Typ zapisany w ostatnich 30 minutach przed meczem zdjęcia nie dostaje: jego „kurs
 *          z publikacji" byłby kursem zamknięcia, a CLV — zerem z definicji.
 *
 * KOSZT (pomiar 21.11.2026 na 55 dniach): ok. 2–3 mecze dziennie bez dziennika × 2 zdjęcia
 * i ok. 2 typy dziennie po porannym zdjęciu → ok. 6–10 zapytań na dobę przy limicie 7500
 * (dziennik zużywa ok. 300). Budżet przebiegu ogranicza najgorszy przypadek.
 */

const CONCURRENCY = 4;

const ms = (v) => (v ? new Date(v).getTime() : null);

/**
 * Co trzeba zdjąć w tym przebiegu — część bez sieci i bez zapisów, sprawdzana testem.
 *
 * @param {{ fixtureId: string, kickoff: Date, publishedAt: Date[] }} mecz typy rejestru jednego meczu
 * @param {{ forecast?: object|null, extra?: object|null, now: Date }} stan
 * @returns {Array<'open'|'close'|'after'>}
 */
export function tasksFor(mecz, { forecast = null, extra = null, now }) {
	const t = now.getTime();
	const kick = ms(mecz.kickoff);
	if (!kick || kick <= t) return [];
	const zadania = [];

	if (!forecast) {
		if (kick <= t + CLOSE_WINDOW_MS) {
			if (!extra?.close) zadania.push('close');
		} else if (kick >= t + OPEN_MIN_LEAD_MS && kick <= openWindowEnd(now).getTime() && !extra?.open) {
			zadania.push('open');
		}
	}

	if (kick > t + CLOSE_WINDOW_MS && !zadania.includes('open')) {
		const poranne = ms(forecast?.odds?.open?.at) ?? ms(extra?.open?.at);
		const zdjecia = [poranne, ...(extra?.after || []).map((s) => ms(s.at))].filter((v) => v !== null);
		/*
		 * Poranne zdjęcie przyjdzie samo, jeśli jeszcze go nie było, a mecz jest w oknie porannym
		 * (godzina przed meczem lub więcej). Bez poranka i bez szans na nie — zdjęcie teraz.
		 */
		const porankaNieBedzie = poranne === null && kick < t + OPEN_MIN_LEAD_MS;
		const potrzebne = (mecz.publishedAt || []).some((p) => {
			const zapis = ms(p);
			if (zapis === null || zdjecia.some((at) => at >= zapis)) return false;
			return poranne !== null || porankaNieBedzie;
		});
		if (potrzebne) zadania.push('after');
	}
	return zadania;
}

/**
 * @param {{ now?: Date, budget?: number, fetchOdds?: (fixtureId: string) => Promise<object|null> }} [options]
 * @returns {Promise<{ open: number, close: number, after: number, empty: number, failed: number }>}
 */
export async function snapshotRegisterOdds({ now = new Date(), budget = 40, fetchOdds = fetchOddsSnapshot } = {}) {
	const t = now.getTime();
	const gorna = new Date(Math.max(openWindowEnd(now).getTime(), t + CLOSE_WINDOW_MS));
	const typy = await Pick.find({ ...REGISTER_QUERY, status: 'pending', kickoff: { $gt: now, $lte: gorna } })
		.select('fixtureId kickoff createdAt')
		.lean();

	const mecze = new Map();
	for (const p of typy) {
		const m = mecze.get(p.fixtureId) || { fixtureId: p.fixtureId, kickoff: p.kickoff, publishedAt: [] };
		m.publishedAt.push(p.createdAt);
		mecze.set(p.fixtureId, m);
	}
	const podsumowanie = { open: 0, close: 0, after: 0, empty: 0, failed: 0 };
	if (!mecze.size) return podsumowanie;

	const ids = [...mecze.keys()];
	const [dziennik, zapas] = await Promise.all([
		ModelForecast.find({ fixtureId: { $in: ids } }).select('fixtureId odds.open.at odds.close.at').lean(),
		RegisterOdds.find({ fixtureId: { $in: ids } }).lean(),
	]);
	const zDziennika = new Map(dziennik.map((f) => [f.fixtureId, f]));
	const zZapasu = new Map(zapas.map((f) => [f.fixtureId, f]));

	const kolejnosc = { close: 0, after: 1, open: 2 };
	const zadania = [];
	for (const m of mecze.values()) {
		for (const faza of tasksFor(m, { forecast: zDziennika.get(m.fixtureId) ?? null, extra: zZapasu.get(m.fixtureId) ?? null, now })) {
			zadania.push({ m, faza });
		}
	}
	// Zamknięcie najpierw: jego okno trwa pół godziny, poranne i przy publikacji poczekają przebieg.
	zadania.sort((a, b) => kolejnosc[a.faza] - kolejnosc[b.faza] || ms(a.m.kickoff) - ms(b.m.kickoff));

	const wykonaj = async ({ m, faza }) => {
		let zdjecie;
		try {
			// Pusty wynik też zapisujemy (`bookmakers: 0`) — inaczej pytalibyśmy o ten mecz co przebieg.
			zdjecie = (await fetchOdds(m.fixtureId)) || { at: new Date(), bookmakers: 0 };
		} catch (error) {
			podsumowanie.failed += 1;
			console.warn(`[register-odds] ${m.fixtureId} (${faza}):`, error.message);
			return;
		}
		await RegisterOdds.updateOne(
			{ fixtureId: m.fixtureId },
			{ $setOnInsert: { fixtureId: m.fixtureId, kickoff: m.kickoff } },
			{ upsert: true }
		);
		if (faza === 'after') {
			// Najwyżej dziesięć zdjęć na mecz — więcej nie ma sensu, a dokument nie może rosnąć bez końca.
			await RegisterOdds.updateOne({ fixtureId: m.fixtureId }, { $push: { after: { $each: [zdjecie], $slice: -10 } } });
		} else {
			await RegisterOdds.updateOne({ fixtureId: m.fixtureId, [faza]: null }, { $set: { [faza]: zdjecie } });
		}
		podsumowanie[faza] += 1;
		if (!zdjecie.bookmakers) podsumowanie.empty += 1;
	};

	const doZrobienia = zadania.slice(0, Math.max(0, budget));
	for (let i = 0; i < doZrobienia.length; i += CONCURRENCY) {
		await Promise.all(doZrobienia.slice(i, i + CONCURRENCY).map(wykonaj));
	}
	return podsumowanie;
}
