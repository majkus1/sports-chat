import { previewLeague, previewNumbers } from '@/lib/seo/matchPreview';

/**
 * Zapowiedź meczu na stronie „typ na mecz" (`/typ/...`) — tekst z danych, bez modelu językowego.
 *
 * PO CO. Strona typu miała same liczby (szanse i spodziewane gole) i krótki tytuł — dla zapytania
 * „analiza Legia – Lech typ" to za mało, żeby wyszukiwarka uznała ją za odpowiedź, a za mało też
 * dla człowieka. Zapowiedź opowiada te same liczby zdaniami i dokłada dwie rzeczy, które już leżą
 * w bazie: FORMĘ (rozliczone prognozy z dziennika `ModelForecast` — wynik każdego meczu drużyny,
 * który model liczył) i STRZAŁY (`FixtureStats`, zbierane do kalibracji goli). Zero zapytań do
 * płatnego API: robot może wejść na tysiąc takich stron i nie kosztuje to ani jednego.
 *
 * BEZ CIENKICH STRON. Gdy dziennik nie ma liczb modelu (`enough: false`), strona dostaje `noindex`
 * — zapowiedź z samego tytułu i daty to dokładnie ta treść, za którą wyszukiwarki karzą serwis.
 * Forma pokazuje się od 2 meczów, strzały od 3 — mniej to anegdota, nie liczba.
 *
 * Bez języka zakładów (jak `matchPreview.js`): szanse, gole, forma — żadnych kursów i stawek.
 */

/** Forma od tylu meczów, strzały od tylu — poniżej to przypadek, nie obraz drużyny. */
export const MIN_FORM = 2;
export const MIN_SHOTS = 3;
const FORM_LEN = 5;
const SHOTS_LEN = 10;

/**
 * Ostatnie mecze drużyny z rozliczonego dziennika prognoz, od najnowszego.
 *
 * @param {Array<object>} rows dokumenty `ModelForecast` z `homeId`, `awayId`, nazwami, `kickoff` i `result`
 * @param {number} teamId
 * @returns {Array<{ result: 'W'|'D'|'L', gf: number, ga: number, opponent: string|null, home: boolean, kickoff: Date }>}
 */
export function teamForm(rows, teamId, limit = FORM_LEN) {
	const out = [];
	const posortowane = [...(rows || [])].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
	for (const r of posortowane) {
		if (!Number.isFinite(r?.result?.home) || !Number.isFinite(r?.result?.away)) continue;
		const uSiebie = r.homeId === teamId;
		if (!uSiebie && r.awayId !== teamId) continue;
		const gf = uSiebie ? r.result.home : r.result.away;
		const ga = uSiebie ? r.result.away : r.result.home;
		out.push({
			result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
			gf,
			ga,
			opponent: (uSiebie ? r.awayName : r.homeName) || null,
			home: uSiebie,
			kickoff: new Date(r.kickoff),
		});
		if (out.length >= limit) break;
	}
	return out;
}

/** Średnie strzały i strzały celne drużyny z `FixtureStats` (mecze bez statystyk pomijane). */
export function shotAverages(rows, teamId, limit = SHOTS_LEN) {
	const mecze = [];
	const posortowane = [...(rows || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
	for (const r of posortowane) {
		const uSiebie = r.homeId === teamId;
		if (!uSiebie && r.awayId !== teamId) continue;
		const s = uSiebie ? r.hs : r.as;
		const st = uSiebie ? r.hst : r.ast;
		if (!Number.isFinite(s) || !Number.isFinite(st)) continue;
		mecze.push({ s, st });
		if (mecze.length >= limit) break;
	}
	if (!mecze.length) return { matches: 0, shots: null, onTarget: null };
	const sr = (k) => mecze.reduce((a, m) => a + m[k], 0) / mecze.length;
	return { matches: mecze.length, shots: sr('s'), onTarget: sr('st') };
}

/** Bilans formy: wygrane, remisy, porażki i bramki. */
export function formSummary(form) {
	return {
		n: form.length,
		w: form.filter((m) => m.result === 'W').length,
		d: form.filter((m) => m.result === 'D').length,
		l: form.filter((m) => m.result === 'L').length,
		gf: form.reduce((a, m) => a + m.gf, 0),
		ga: form.reduce((a, m) => a + m.ga, 0),
	};
}

/** Polska odmiana: 1 wygrana, 2 wygrane, 5 wygranych. */
function odm(n, [jeden, kilka, wiele]) {
	if (n === 1) return jeden;
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? kilka : wiele;
}

const liczba = (x, locale, digits = 1) => (Number.isFinite(x) ? x.toFixed(digits).replace('.', locale === 'en' ? '.' : ',') : null);
const proc = (x) => (Number.isFinite(x) ? Math.round(100 * x) : null);

function kiedy(iso, locale) {
	const d = new Date(iso);
	const loc = locale === 'en' ? 'en-GB' : 'pl-PL';
	return {
		dzien: d.toLocaleDateString(loc, { timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long' }),
		godzina: d.toLocaleTimeString(loc, { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }),
	};
}

/**
 * Zapowiedź: akapity, kluczowe liczby i forma do pokazania — albo `enough: false`.
 *
 * @param {{ forecast: object, homeForm?: Array, awayForm?: Array, homeShots?: object, awayShots?: object,
 *   locale?: string, now?: Date }} input
 */
export function matchStory({ forecast: f, homeForm = [], awayForm = [], homeShots = null, awayShots = null, locale = 'pl', now = new Date() }) {
	const n = previewNumbers(f, locale);
	const enough = Number.isFinite(n.home) && Number.isFinite(n.draw) && Number.isFinite(n.away) && Boolean(n.lambdaHome && n.lambdaAway);
	if (!enough) return { enough: false, paragraphs: [], facts: [], form: [] };

	const en = locale === 'en';
	const H = f.homeName;
	const A = f.awayName;
	const liga = previewLeague(f);
	const { dzien, godzina } = kiedy(f.kickoff, locale);
	const pozniej = new Date(f.kickoff).getTime() <= now.getTime();
	const suma = liczba((f.lambdaHome ?? 0) + (f.lambdaAway ?? 0), locale);
	const o25 = proc(f.markets?.over25);
	const btts = proc(f.markets?.btts);

	const akapity = [];

	// 1. Kiedy i kto jest faworytem — różnica szans gospodarzy i gości decyduje o tonie zdania.
	const wstep = en
		? pozniej
			? `${H} vs ${A}${liga ? ` (${liga})` : ''} was played on ${dzien}. Below are the model’s numbers from before kick-off.`
			: `${H} host ${A}${liga ? ` in the ${liga}` : ''} on ${dzien} at ${godzina}.`
		: pozniej
			? `${H} – ${A}${liga ? ` (${liga})` : ''}, ${dzien}: mecz już się odbył, poniżej liczby modelu sprzed pierwszego gwizdka.`
			: /*
				 * Ani nazw drużyn, ani dnia tygodnia nie odmieniamy („podejmuje Lech", „na środa" byłyby
				 * błędem), więc zdanie stoi bez czasownika i przyimka przy nich.
				 */
				`${H} – ${A}${liga ? ` (${liga})` : ''}: ${dzien}, godz. ${godzina}.`;
	const gospodarzLepszy = n.home >= n.away;
	const fav = gospodarzLepszy ? H : A;
	const pFav = gospodarzLepszy ? n.home : n.away;
	const pInny = gospodarzLepszy ? n.away : n.home;
	const inny = gospodarzLepszy ? A : H;
	const roznica = pFav - pInny;
	let faworyt;
	if (roznica >= 15) {
		faworyt = en
			? `The model makes ${fav} clear favourites: ${pFav}% to win, ${n.draw}% for a draw, ${pInny}% for ${inny}.`
			: `Wyraźnym faworytem według modelu jest ${fav}: ${pFav}% na wygraną, remis ${n.draw}%, ${inny} ${pInny}%.`;
	} else if (roznica >= 6) {
		faworyt = en
			? `The model gives ${fav} a slight edge (${pFav}% against ${pInny}%), with a draw at ${n.draw}%.`
			: `Lekką przewagę model daje drużynie ${fav} (${pFav}% wobec ${pInny}%), remis ${n.draw}%.`;
	} else {
		faworyt = en
			? `The model sees no clear favourite: ${H} ${n.home}%, draw ${n.draw}%, ${A} ${n.away}%.`
			: `Model nie widzi wyraźnego faworyta: ${H} ${n.home}%, remis ${n.draw}%, ${A} ${n.away}%.`;
	}
	akapity.push(`${wstep} ${faworyt}`);

	// 2. Gole — średnie Dixona-Colesa i dwa rynki bramkowe, jeśli dziennik je ma.
	const gole = [
		en ? `Expected goals: ${n.lambdaHome} – ${n.lambdaAway} (${suma} in total).` : `Spodziewane gole: ${n.lambdaHome} – ${n.lambdaAway} (łącznie ${suma}).`,
		Number.isFinite(o25) ? (en ? `Chance of more than 2.5 goals: ${o25}%.` : `Szansa na więcej niż 2,5 gola: ${o25}%.`) : null,
		Number.isFinite(btts) ? (en ? `Both teams to score: ${btts}%.` : `Gole obu drużyn: ${btts}%.`) : null,
	].filter(Boolean);
	akapity.push(gole.join(' '));

	// 3. Forma z dziennika — tylko w tych rozgrywkach (zapytanie idzie po lidze, po indeksie).
	const forma = [
		{ team: H, form: homeForm },
		{ team: A, form: awayForm },
	].filter((x) => x.form.length >= MIN_FORM);
	if (forma.length) {
		const zdania = forma.map(({ team, form }) => {
			const s = formSummary(form);
			return en
				? `${team}: ${s.w} won, ${s.d} drawn, ${s.l} lost in the last ${s.n} matches in this competition (goals ${s.gf}:${s.ga}).`
				: `${team}: ${s.w} ${odm(s.w, ['wygrana', 'wygrane', 'wygranych'])}, ${s.d} ${odm(s.d, ['remis', 'remisy', 'remisów'])}, ${s.l} ${odm(s.l, ['porażka', 'porażki', 'porażek'])} w ostatnich ${s.n} meczach tych rozgrywek (bramki ${s.gf}:${s.ga}).`;
		});
		akapity.push(zdania.join(' '));
	}

	// 4. Strzały — średnie z ostatnich meczów ze statystykami.
	const strzaly = [
		{ team: H, s: homeShots },
		{ team: A, s: awayShots },
	].filter((x) => x.s?.matches >= MIN_SHOTS);
	if (strzaly.length) {
		const zdania = strzaly.map(({ team, s }) =>
			en
				? `${team} average ${liczba(s.shots, locale)} shots, ${liczba(s.onTarget, locale)} on target (last ${s.matches}).`
				: `${team} oddaje średnio ${liczba(s.shots, locale)} strzału na mecz, w tym ${liczba(s.onTarget, locale)} celnego (ostatnie ${s.matches}).`
		);
		akapity.push(zdania.join(' '));
	}

	const facts = [
		{ label: en ? 'Expected goals in total' : 'Spodziewane gole łącznie', value: suma },
		...(Number.isFinite(o25) ? [{ label: en ? 'More than 2.5 goals' : 'Więcej niż 2,5 gola', value: `${o25}%` }] : []),
		...(Number.isFinite(btts) ? [{ label: en ? 'Both teams score' : 'Gole obu drużyn', value: `${btts}%` }] : []),
		...strzaly.map(({ team, s }) => ({
			label: en ? `${team}: shots on target per match` : `${team}: celne strzały na mecz`,
			value: liczba(s.onTarget, locale),
		})),
	];

	return {
		enough: true,
		paragraphs: akapity,
		facts,
		form: forma.map(({ team, form }) => ({ team, form, summary: formSummary(form) })),
	};
}
