import { HINT_TO_SELECTION } from '@/lib/model/oddsShadow';
import { LEG_HOURS, kickoffMinute } from '@/lib/coupons/build';

/**
 * TYPY Z WYŻSZYM KURSEM — część czysta: które selekcje wchodzą i w jakiej kolejności.
 *
 * DECYZJA WŁAŚCICIELA (17.10.2026), PODJĘTA NA LICZBACH. Pomiar na dzienniku prognoz z porannymi
 * kursami (449 rozliczonych meczów) pokazał, że przy kursie 2,0+ model NIE wybiera lepiej niż
 * na ślepo, a im mocniej nie zgadza się z rynkiem, tym gorzej trafia:
 *   - kurs 2,0–4,0, model ≥ rynek + 5 pkt: 144 typy, model mówił 50%, trafiło 34%, zwrot −14%;
 *   - kurs 2,0–2,3, model ≥ rynek:          87 typów, rynek mówił 47%, trafiło 47%, zwrot ~0%.
 * Właściciel zdecydował publikować je mimo to — publicznie i z osobnym bilansem. Stąd zasady,
 * które wybierają NAJMNIEJ ZŁY wariant z pomiaru:
 *
 *   1. kurs tuż nad progiem użytkownika (`[próg, próg + 0,3)`) — wyżej trafność spada szybciej
 *      niż rośnie kurs;
 *   2. model nie może widzieć MNIEJ niż rynek (zgoda co do kierunku), ale przewagi nie
 *      nagradzamy — duża różnica zdań z rynkiem to w tych danych błąd modelu, nie okazja;
 *   3. kolejność: najniższy kurs (największa szansa według rynku), potem wyższy procent modelu;
 *   4. bez remisu (model źle liczy remisy) i tylko mecze 12:00–23:00, jak na kuponach.
 *
 * UCZCIWA LICZBA TO SZANSA RYNKU. Pokazujemy ją pierwszą; procent modelu obok, podpisany —
 * przy tych kursach bywa zawyżony o kilkanaście punktów.
 */

export const VALUE_DEFAULT_MIN_ODDS = 2.0;
export const VALUE_SPAN = 0.3;
export const VALUE_MIN_LEAD_MS = 30 * 60 * 1000;

/** Klucz selekcji w zdjęciu kursów (`dc1X`) → klucz plakietki (`1X`) — ten sam co w kuponach. */
const DO_KLUCZA = Object.fromEntries(Object.entries(HINT_TO_SELECTION).map(([hint, sel]) => [sel, hint]));

/** Prawdopodobieństwa rynków z `predictFixture` (ułamki) — ten sam zapis co w dzienniku prognoz. */
export function modelMarkets(p) {
	if (!p) return null;
	return {
		home: p.matchWinner?.home ?? null,
		away: p.matchWinner?.away ?? null,
		dc1X: p.doubleChance?.['1X'] ?? null,
		dcX2: p.doubleChance?.X2 ?? null,
		homeScores: p.teamGoals?.home?.over ?? null,
		awayScores: p.teamGoals?.away?.over ?? null,
		over25: p.over25?.probability ?? null,
	};
}

/** Przedział kursu dla progu użytkownika: od progu do progu + 0,3 (próg 1,5–5). */
export function oddsWindow(minOdds = VALUE_DEFAULT_MIN_ODDS) {
	const lo = Math.min(5, Math.max(1.5, Number(minOdds) || VALUE_DEFAULT_MIN_ODDS));
	return { lo, hi: Number((lo + VALUE_SPAN).toFixed(2)) };
}

/** Mecz, który może dostać typ: start za co najmniej 30 minut, między 12:00 a 23:00. */
export function valueKickoffOk(kickoff, now = new Date()) {
	const minuta = kickoffMinute(kickoff);
	return (
		new Date(kickoff).getTime() - now.getTime() >= VALUE_MIN_LEAD_MS &&
		minuta >= LEG_HOURS.from &&
		minuta <= LEG_HOURS.to
	);
}

export const byValueRank = (a, b) => a.odds - b.odds || b.model - a.model;

/**
 * Selekcje jednego meczu, które przechodzą zasady — od najlepszej.
 *
 * @param {{ markets: object, odds: object, minOdds?: number }} input `markets` z `modelMarkets`,
 *   `odds` — zdjęcie kursów (`oddsSnapshot`)
 * @returns {Array<{ key: string, odds: number, market: number, model: number }>} procenty całkowite
 */
export function valueSelections({ markets, odds, minOdds = VALUE_DEFAULT_MIN_ODDS }) {
	const { lo, hi } = oddsWindow(minOdds);
	const out = [];
	for (const [sel, key] of Object.entries(DO_KLUCZA)) {
		const kurs = odds?.[sel];
		const p = markets?.[sel];
		if (!Number.isFinite(kurs) || !Number.isFinite(p)) continue;
		if (kurs < lo || kurs >= hi) continue;
		const rynek = 100 / kurs;
		const model = 100 * p;
		if (model < rynek) continue;
		out.push({ key, odds: Number(kurs.toFixed(2)), market: Math.round(rynek), model: Math.round(model) });
	}
	return out.sort(byValueRank);
}
