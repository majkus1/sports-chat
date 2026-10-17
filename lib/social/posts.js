/**
 * Posty do mediów społecznościowych — z tych samych liczb co typ dnia i poranny mail.
 *
 * PO CO. Ruch z wyszukiwarki rośnie powoli, a typ dnia to gotowa, codzienna treść: mecz,
 * selekcja, procent wobec „zwykle" i publiczne rozliczenie wczorajszego. Post powstaje
 * automatycznie; właściciel publikuje go jednym kliknięciem (przycisk w porannym mailu
 * i na stronie `/admin/posty` otwiera X z wpisanym tekstem). Bez kluczy API — automatyczną
 * publikację można dołożyć później, treść zostanie ta sama.
 *
 * ZASADY TREŚCI — te same co w mailu: bez nazw bukmacherów, kursów i słów o zakładach,
 * z dopiskiem 18+. Pudła publikujemy tak samo jak trafienia — to one budują wiarygodność.
 * Wyjątek: post z kuponem (`buildCouponPost`) podaje kursy — kupon bez kursu nie ma sensu;
 * to mediana bukmacherów bez nazw, obok zawsze szansa według modelu.
 *
 * Tylko po polsku: konto jest dla polskiego czytelnika, a angielski post bez angielskiej
 * publiczności byłby szumem.
 */

/** Limit X i stała długość odnośnika po skróceniu przez t.co. */
export const X_LIMIT = 280;
export const X_URL_LENGTH = 23;

/** Polskie nazwy najważniejszych rozgrywek i hashtag, po którym ludzie ich szukają (jeden — dwa nie mieściły się w limicie). */
const LIGI = new Map([
	[2, { name: 'Liga Mistrzów', tag: '#LigaMistrzów' }],
	[3, { name: 'Liga Europy', tag: '#LigaEuropy' }],
	[848, { name: 'Liga Konferencji', tag: '#LigaKonferencji' }],
	[5, { name: 'Liga Narodów', tag: '#LigaNarodów' }],
	[1, { name: 'Mistrzostwa świata', tag: '#MŚ' }],
	[4, { name: 'Euro', tag: '#Euro' }],
	[32, { name: 'eliminacje MŚ', tag: '#ElMŚ' }],
	[960, { name: 'eliminacje Euro', tag: '#ElEuro' }],
	[39, { name: 'Premier League', tag: '#PremierLeague' }],
	[140, { name: 'La Liga', tag: '#LaLiga' }],
	[135, { name: 'Serie A', tag: '#SerieA' }],
	[78, { name: 'Bundesliga', tag: '#Bundesliga' }],
	[61, { name: 'Ligue 1', tag: '#Ligue1' }],
	[106, { name: 'Ekstraklasa', tag: '#Ekstraklasa' }],
	[107, { name: 'I liga', tag: '#1liga' }],
]);

const URL_RE = /https?:\/\/\S+/g;

/**
 * Długość tekstu tak, jak liczy ją X: odnośnik to zawsze 23 znaki, znaki z podstawowych
 * zakresów (łacinka z polskimi literami, interpunkcja) po 1, reszta — w tym emoji — po 2.
 */
export function xLength(text) {
	let n = 0;
	const bezUrl = String(text || '').replace(URL_RE, () => {
		n += X_URL_LENGTH;
		return '';
	});
	for (const ch of bezUrl) {
		const cp = ch.codePointAt(0);
		const lekki = cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
		n += lekki ? 1 : 2;
	}
	return n;
}

/** Nazwa rozgrywek do posta: polska dla najważniejszych, inaczej to, co przed przecinkiem. */
export function leagueLabel(leagueId, league) {
	return LIGI.get(leagueId)?.name || String(league || '').split(',')[0].trim() || null;
}

function godzina(iso) {
	return new Date(iso).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
}

function dzienMiesiac(iso) {
	return new Date(iso).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' });
}

/** Link do „Typów na dziś" z oznaczeniem źródła — w Analytics widać, ile wejść dał post. */
export function postLink(siteUrl, campaign = 'typ-dnia') {
	return `${String(siteUrl || '').replace(/\/$/, '')}/pl/typy-na-dzis?utm_source=x&utm_medium=social&utm_campaign=${campaign}`;
}

/**
 * Post z typem dnia. `null`, gdy typu dnia nie ma — wtedy nie ma czego publikować.
 *
 * Gdy całość nie mieści się w limicie (długie nazwy drużyn), odpada najpierw dorobek, potem
 * wczorajszy wynik (zostaje krótszy dorobek, jeśli się zmieści), potem hashtag ligi i nazwa
 * rozgrywek, a „Szacunki, nie pewniaki" skraca się do samego „18+". Mecz, typ, link i „18+"
 * zostają zawsze.
 *
 * @param {{ daily: object|null, yesterday?: object|null, record?: { won: number, total: number }, siteUrl: string }} input
 *   `daily` i `yesterday` w postaci `toDto` z `lib/daily/service.js`
 * @returns {{ text: string, length: number } | null}
 */
export function buildDailyPost({ daily, yesterday = null, record = null, siteUrl }) {
	if (!daily) return null;
	const liga = leagueLabel(daily.leagueId, daily.league);
	const tagLigi = LIGI.get(daily.leagueId)?.tag || null;

	const wczoraj =
		yesterday && (yesterday.status === 'won' || yesterday.status === 'lost')
			? `Wczoraj: ${yesterday.home} – ${yesterday.away} ${yesterday.status === 'won' ? '✅' : '❌'}${yesterday.score ? ` ${yesterday.score}` : ''}`
			: null;
	const dorobek = record?.total > 0 ? `Typ dnia dotąd: ${record.won}/${record.total} trafionych` : null;

	const zloz = ({ zWczoraj, zDorobkiem, zTagiemLigi, zLiga = true, krotko = false }) => {
		const linie = [
			`⚽ Typ dnia · ${dzienMiesiac(daily.kickoff)}`,
			`${daily.home} – ${daily.away}, ${godzina(daily.kickoff)}${zLiga && liga ? ` · ${liga}` : ''}`,
			`Model: ${daily.selection} · ${daily.probability}% (zwykle ${daily.base}%)`,
		];
		const historia = [zWczoraj && wczoraj, zDorobkiem && dorobek].filter(Boolean);
		if (historia.length) linie.push('', ...historia);
		linie.push('', `Wszystkie typy 👉 ${postLink(siteUrl)}`, krotko ? '18+' : 'Szacunki, nie pewniaki. 18+');
		linie.push([zTagiemLigi && tagLigi, '#typdnia'].filter(Boolean).join(' '));
		return linie.join('\n');
	};

	// Od pełnego do najkrótszego; ostatnie dwa kroki to ratunek dla bardzo długich nazw drużyn.
	const warianty = [
		{ zWczoraj: true, zDorobkiem: true, zTagiemLigi: true },
		{ zWczoraj: true, zDorobkiem: false, zTagiemLigi: true },
		// Dorobek jest krótszy od wczorajszego wyniku — zmieści się tam, gdzie wynik już nie.
		{ zWczoraj: false, zDorobkiem: true, zTagiemLigi: true },
		{ zWczoraj: false, zDorobkiem: false, zTagiemLigi: true },
		{ zWczoraj: false, zDorobkiem: false, zTagiemLigi: false },
		{ zWczoraj: false, zDorobkiem: false, zTagiemLigi: false, zLiga: false },
		{ zWczoraj: false, zDorobkiem: false, zTagiemLigi: false, zLiga: false, krotko: true },
	];
	for (const w of warianty) {
		const text = zloz(w);
		const length = xLength(text);
		if (length <= X_LIMIT) return { text, length };
	}
	const text = zloz(warianty[warianty.length - 1]);
	return { text, length: xLength(text) };
}

/** Odnośnik, który otwiera X z wpisanym postem — publikacja jednym kliknięciem, bez API. */
export function xIntentUrl(text) {
	return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

const kursPl = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');

/**
 * Post z kuponem dnia albo weekendowym. `null`, gdy kuponu nie ma albo już się zaczął.
 *
 * Wiersz na typ: mecz, typ i kurs. Gdy nie mieści się w limicie, najpierw odpada wczorajszy
 * wynik, potem pełny opis typu ustępuje skrótowi kuponowemu (1, X2, G1…), potem hashtag,
 * a na końcu ostatnie typy przechodzą do „…i N więcej na stronie". Kurs łączny, szansa
 * modelu, link i „18+" zostają zawsze.
 *
 * @param {{ coupon: object|null, previous?: object|null, siteUrl: string }} input
 *   w postaci `couponDto` z `lib/coupons/service.js`; `previous` — poprzedni kupon tego rodzaju
 * @returns {{ text: string, length: number } | null}
 */
export function buildCouponPost({ coupon, previous = null, siteUrl }) {
	if (!coupon?.legs?.length || coupon.status !== 'pending') return null;
	if (coupon.legs.some((l) => Date.parse(l.kickoff) <= Date.now())) return null;
	const weekend = coupon.type === 'weekend';
	const naglowek = `🎟️ ${weekend ? 'Kupon weekendowy' : `Kupon dnia · ${dzienMiesiac(coupon.legs[0].kickoff)}`} · kurs ${kursPl(coupon.totalOdds)}`;
	const poprzedni =
		previous && (previous.status === 'won' || previous.status === 'lost')
			? `${weekend ? 'Poprzedni weekendowy' : 'Wczorajszy kupon'}: ${previous.status === 'won' ? `✅ wszedł (${kursPl(previous.settledOdds ?? previous.totalOdds)})` : '❌ nie wszedł'}`
			: null;

	const zloz = ({ zPoprzednim, skrot, zTagiem, ile = coupon.legs.length }) => {
		const reszta = coupon.legs.length - ile;
		const linie = [
			naglowek,
			'',
			...coupon.legs.slice(0, ile).map((l) => `${l.home} – ${l.away}: ${skrot ? l.label : l.selection} (${kursPl(l.odds)})`),
			...(reszta > 0 ? [`…i ${reszta} więcej na stronie`] : []),
			'',
			`Szansa według modelu: ${coupon.chance}%`,
		];
		if (zPoprzednim && poprzedni) linie.push(poprzedni);
		linie.push('', `Szczegóły 👉 ${postLink(siteUrl, weekend ? 'kupon-weekend' : 'kupon-dnia')}`, '18+');
		if (zTagiem) linie.push(weekend ? '#kuponweekendowy' : '#kupondnia');
		return linie.join('\n');
	};

	const warianty = [
		{ zPoprzednim: true, skrot: false, zTagiem: true },
		{ zPoprzednim: false, skrot: false, zTagiem: true },
		{ zPoprzednim: true, skrot: true, zTagiem: true },
		{ zPoprzednim: false, skrot: true, zTagiem: true },
		{ zPoprzednim: false, skrot: true, zTagiem: false },
		// Długie nazwy przy sześciu–ośmiu typach: tyle wierszy, ile się zmieści, reszta „na stronie".
		...Array.from({ length: coupon.legs.length - 1 }, (_, i) => ({
			zPoprzednim: false,
			skrot: true,
			zTagiem: false,
			ile: coupon.legs.length - 1 - i,
		})),
	];
	for (const w of warianty) {
		const text = zloz(w);
		const length = xLength(text);
		if (length <= X_LIMIT) return { text, length };
	}
	const text = zloz(warianty[warianty.length - 1]);
	return { text, length: xLength(text) };
}
