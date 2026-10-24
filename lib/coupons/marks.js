import { COMPACT_LABELS } from '@/lib/model/hints';
import { PAID_COUPON_TYPES } from '@/lib/coupons/build';

/**
 * Plakietki na liście meczów a typ dnia i kupony — jedna selekcja w całej aplikacji.
 *
 * PO CO. Typ dnia i kupony biorą plakietki modelu, ale zapisują je raz (typ dnia przy pierwszym
 * zapytaniu dnia, kupony o 9:30) i już ich nie zmieniają. Plakietka na liście liczy się na
 * bieżąco i po przeliczeniu modelu ligi (co 6 godzin) potrafi wskazać inną selekcję albo inny
 * procent. Wtedy przy meczu stało „1 · 62%", a na kuponie tego samego meczu „1X · 87%" (Huddersfield
 * – Wigan, 24.10.2026) — dwa różne zdania modelu o jednym meczu. Tu decydujemy, co lista pokazuje:
 *
 *   - mecz z typem dnia albo z kuponu — selekcję z ZAPISU (tę samą co karta typu dnia i kupon)
 *     i znaczniki: „Typ dnia", „W kuponie dnia", „W kuponie 3-/5-dniowym";
 *   - pozostałe — bieżącą plakietkę, jak dotąd (plan z liczbami) albo kłódkę.
 *
 * KTO WIDZI CO. Typ dnia i kupon dnia są za darmo, więc ich selekcja jest odkryta dla wszystkich —
 * i tak stoi na stronie „Typy na dziś". Nogi płatnych kuponów (3- i 5-dniowy) tylko z planem
 * (`full`): bez planu nie wolno ich nawet oznaczyć, bo samo „ten mecz jest w płatnym kuponie"
 * zdradza nogę. Trasa w ogóle nie pyta o nie bez planu (`couponLegsForDate`), a tutaj filtr
 * jest drugi raz — na wypadek, gdyby ktoś je kiedyś podał.
 */

/** Kolejność znaczników przy meczu — darmowy kupon pierwszy. */
const KOLEJNOSC = ['daily', 'days3', 'days5'];

/** Plakietka z zapisu typu dnia albo nogi kuponu — w kształcie plakietki z `bestHint`. */
function zZapisu(z) {
	const base = Number.isFinite(z.base) ? z.base : null;
	return {
		key: z.key,
		label: COMPACT_LABELS[z.key] || z.key,
		selection: z.selection,
		probability: z.probability,
		base,
		// Noga kuponu nie ma zapisanej przewagi — liczymy ją tak jak `liftFor` (szansa − norma).
		lift: Number.isFinite(z.lift) ? z.lift : base === null ? null : Math.round(z.probability - base),
	};
}

/**
 * @param {{ full: boolean, daily?: object|null, couponLegs?: Array<{ type: string, fixtureId: string, key: string, selection: string, probability: number, base?: number|null }> }} options
 *   `full` — plan z liczbami; `daily` — zapis typu dnia (`DailyPick` albo jego DTO);
 *   `couponLegs` — z `couponLegsForDate`
 * @returns {{ present: (fixtureId: string, hint: object|null) => object|null, fixtureIds: string[] }}
 *   `present` — plakietka do odpowiedzi (`null`, gdy mecz nie ma nic do pokazania);
 *   `fixtureIds` — mecze z zapisu, także te, których bieżąca lista plakietek już nie ma
 */
export function hintPresenter({ full, daily = null, couponLegs = [] }) {
	const dziennyId = daily?.fixtureId != null ? String(daily.fixtureId) : null;
	const nogi = new Map();
	for (const l of couponLegs || []) {
		if (!l || !KOLEJNOSC.includes(l.type)) continue;
		if (!full && PAID_COUPON_TYPES.has(l.type)) continue;
		const id = String(l.fixtureId);
		if (!nogi.has(id)) nogi.set(id, []);
		nogi.get(id).push(l);
	}
	for (const lista of nogi.values()) lista.sort((a, b) => KOLEJNOSC.indexOf(a.type) - KOLEJNOSC.indexOf(b.type));

	const present = (fixtureId, hint) => {
		const id = String(fixtureId);
		const jestDzienny = dziennyId === id;
		const nogiMeczu = nogi.get(id) || [];
		const zapis = jestDzienny ? zZapisu(daily) : nogiMeczu.length ? zZapisu(nogiMeczu[0]) : null;
		const widok = zapis || (full && hint && !hint.locked ? hint : null);
		if (!widok) return hint ? { locked: true } : null;
		// Znacznik kuponu tylko przy tej samej selekcji — nigdy „Typ dnia: 1" obok kuponu z „1X".
		const kupony = [...new Set(nogiMeczu.filter((l) => l.key === widok.key).map((l) => l.type))];
		return { ...widok, ...(jestDzienny ? { daily: true } : {}), ...(kupony.length ? { coupons: kupony } : {}) };
	};

	return { present, fixtureIds: [...new Set([...(dziennyId ? [dziennyId] : []), ...nogi.keys()])] };
}
