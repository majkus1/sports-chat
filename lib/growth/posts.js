import { buildCouponPost, leagueLabel, xLength, X_LIMIT } from '@/lib/social/posts';
import { utmUrl } from '@/lib/growth/source';

/**
 * Posty do ręcznej publikacji (`/admin/posty`) — kupon dnia, rozliczenie wczoraj, tydzień w liczbach —
 * każdy w trzech formatach: X (≤ 280 znaków), grupa na Facebooku, opis na TikToku / Instagramie.
 *
 * PO CO. Ruch z wyszukiwarki rośnie miesiącami, a dziesięć kont w dwa miesiące to za mało, żeby
 * czekać. Treść już jest — liczby modelu i publiczne rozliczenie — brakowało tylko gotowego tekstu
 * pod każdy kanał i LINKU Z UTM, dzięki któremu panel źródeł (`/admin/zrodla`) pokaże, który post
 * przyprowadził konto, które potem używa AI i wraca.
 *
 * UTM SPÓJNE Z PUNKTEM „źródło rejestracji". `utm_source` = kanał (`x`, `facebook`, `tiktok`,
 * `instagram`), `utm_medium=social`, `utm_campaign` = rodzaj posta (`kupon-dnia`, `rozliczenie`,
 * `tydzien`). Link budujemy przez `utmUrl`, który przepuszcza tylko wartości przechodzące tę samą
 * walidację co przy rejestracji (`cleanUtm`) — post nie może dać źródła, którego panel nie odczyta.
 * Post z kuponem na X to dokładnie `buildCouponPost` (`lib/social/posts.js`) — ten sam link.
 *
 * ZASADY TREŚCI (ustawa o grach hazardowych, art. 29: zakaz reklamy i promocji zakładów):
 * informacja, nie zachęta. Żadnego „zagraj", „postaw", bonusów i nazw bukmacherów; pudła stoją
 * obok trafień, liczba „ile weszło" zawsze razem z „ile nie weszło"; zawsze „18+". Kursy wyłącznie
 * w poście z kuponem — kupon bez kursu nie ma sensu — jako mediana bukmacherów bez nazw, obok szansa
 * według modelu i zdanie, że kupon bywa chybiony.
 *
 * BEZ AUTOMATYCZNEJ PUBLIKACJI. Generator tylko składa tekst; publikuje człowiek (kopiuj / otwórz X).
 * Tylko po polsku, jak `lib/social/posts.js`: konta są dla polskiego czytelnika.
 */

/** Limity: X liczy po swojemu (`xLength`), opis na TikToku i Instagramie — 2200 znaków (limit Instagrama, TikTok ma więcej). */
export const LIMITS = { x: X_LIMIT, facebook: 5000, tiktok: 2200, instagram: 2200 };
export const POST_CAMPAIGNS = { coupon: 'kupon-dnia', recap: 'rozliczenie', week: 'tydzien' };

const LINK_PATHS = { coupon: '/pl/typy-na-dzis', recap: '/pl/pilka-nozna/skutecznosc', week: '/pl/pilka-nozna/skutecznosc' };

/** Link posta z utm dla danego kanału. */
export function postUtmLink(siteUrl, kind, source) {
	return utmUrl(siteUrl, LINK_PATHS[kind], { source, medium: 'social', campaign: POST_CAMPAIGNS[kind] });
}

const kursPl = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
const proc = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);

/** `YYYY-MM-DD` albo ISO → `DD.MM` (czas polski). */
function dm(value) {
	const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00Z`) : new Date(value);
	return d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' });
}

function godz(iso) {
	return new Date(iso).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
}

/** „1 typ", „3 typy", „12 typów". */
function typow(n) {
	if (n === 1) return 'typ';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'typy' : 'typów';
}

/** „0 pudeł", „1 pudło", „3 pudła", „5 pudeł". */
function pudel(n) {
	if (n === 1) return 'pudło';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pudła' : 'pudeł';
}

/** Pierwszy wariant mieszczący się w limicie X; w ostateczności najkrótszy. */
function pierwszyWLimicie(teksty) {
	for (const text of teksty) {
		const length = xLength(text);
		if (length <= X_LIMIT) return { text, length };
	}
	const text = teksty[teksty.length - 1];
	return { text, length: xLength(text) };
}

function wariant(id, label, text, link, extra = {}) {
	return { id, label, text, length: id === 'x' ? xLength(text) : [...text].length, limit: LIMITS[id], link, ...extra };
}

/** Komplet czterech kanałów; TikTok i Instagram mają ten sam tekst, różny link do bio. */
function komplet({ kind, siteUrl, x, facebook, short }) {
	return [
		wariant('x', 'X', x.text, postUtmLink(siteUrl, kind, 'x')),
		wariant('facebook', 'Facebook', facebook(postUtmLink(siteUrl, kind, 'facebook')), postUtmLink(siteUrl, kind, 'facebook')),
		// Link w opisie na TikToku i Instagramie nie jest klikalny — idzie do bio, a w tekście „link w bio".
		wariant('tiktok', 'TikTok', short, postUtmLink(siteUrl, kind, 'tiktok'), { bioLink: true }),
		wariant('instagram', 'Instagram', short, postUtmLink(siteUrl, kind, 'instagram'), { bioLink: true }),
	];
}

const STOPKA_FB = '18+ · To szacunki modelu statystycznego, nie pewniaki. Serwis nie przyjmuje zakładów.';
const STOPKA_KROTKA = '18+ · szacunki modelu, nie pewniaki';

/* ---------- kupon dnia ---------- */

/**
 * Kupon dnia (darmowy) we wszystkich formatach. `null`, gdy kuponu nie ma albo pierwszy mecz już
 * się zaczął — wtedy post byłby nieaktualny (ta sama reguła co `buildCouponPost`).
 *
 * @param {{ coupon: object|null, previous?: object|null, siteUrl: string }} input `couponDto` z `lib/coupons/service.js`
 */
export function buildCouponVariants({ coupon, previous = null, siteUrl }) {
	const x = buildCouponPost({ coupon, previous, siteUrl });
	if (!x) return null;
	const nogi = coupon.legs;
	const data = dm(nogi[0].kickoff);
	const poprzedni =
		previous && (previous.status === 'won' || previous.status === 'lost')
			? `Wczorajszy kupon: ${previous.status === 'won' ? `✅ wszedł (kurs ${kursPl(previous.settledOdds ?? previous.totalOdds)})` : '❌ nie wszedł'}`
			: null;

	const facebook = (link) =>
		[
			`🎟️ Kupon dnia · ${data} · kurs łączny ${kursPl(coupon.totalOdds)}`,
			`Szansa, że wejdzie cały, według modelu: ${coupon.chance}%`,
			'',
			...nogi.map((l, i) => {
				const liga = leagueLabel(l.leagueId, l.league);
				return `${i + 1}. ${l.home} – ${l.away} (${godz(l.kickoff)}${liga ? `, ${liga}` : ''}): ${l.selection} · kurs ${kursPl(l.odds)} · model ${l.probability}%`;
			}),
			'',
			'Kursy to mediana kilku bukmacherów (bez nazw). Szansa to wyliczenie modelu z wyników drużyn — kupon bywa chybiony, a każdy rozliczamy publicznie razem z poprzednimi.',
			...(poprzedni ? [poprzedni] : []),
			'',
			`Szczegóły i rozliczenia: ${link}`,
			STOPKA_FB,
		].join('\n');

	const short = [
		`🎟️ Kupon dnia ${data} — kurs łączny ${kursPl(coupon.totalOdds)}, szansa według modelu ${coupon.chance}%`,
		'',
		...nogi.map((l) => `▫️ ${l.home} – ${l.away}: ${l.label || l.selection} (${kursPl(l.odds)})`),
		...(poprzedni ? ['', poprzedni] : []),
		'',
		'Pełne liczby i rozliczenie: link w bio 🔗',
		STOPKA_KROTKA,
		'#kupondnia #piłkanożna #statystyka #analizameczu',
	].join('\n');

	return komplet({ kind: 'coupon', siteUrl, x, facebook, short });
}

/* ---------- rozliczenie wczoraj ---------- */

const znak = (status) => (status === 'won' ? '✅' : '❌');

/**
 * Rozliczenie wczorajszego dnia — typy modelu, typ dnia i kupon dnia, z pudłami wymienionymi z nazwy.
 * `null`, gdy wczoraj nic się nie rozliczyło.
 *
 * Na X nie wszystko się mieści: zostaje zawsze bilans („7 z 10"), a pudła wymieniamy tyle, ile
 * wejdzie, i resztę liczbą („…i 2 inne pudła") — trafień z nazwy nie wymieniamy kosztem pudeł.
 *
 * @param {{ date: string, picks: Array<{ home: string, away: string, selection: string, status: string, score?: string|null }>,
 *   daily?: object|null, coupon?: object|null, siteUrl: string }} input
 */
export function buildRecapVariants({ date, picks = [], daily = null, coupon = null, siteUrl }) {
	const rozliczone = picks.filter((p) => p.status === 'won' || p.status === 'lost');
	const typDnia = daily && (daily.status === 'won' || daily.status === 'lost') ? daily : null;
	const kupon = coupon && (coupon.status === 'won' || coupon.status === 'lost') ? coupon : null;
	if (!rozliczone.length && !typDnia && !kupon) return null;

	const won = rozliczone.filter((p) => p.status === 'won').length;
	const pudla = rozliczone.filter((p) => p.status === 'lost');
	const wynik = (p) => (p.score ? ` (${p.score})` : '');
	const bilans = rozliczone.length ? `Typy modelu: ${won} z ${rozliczone.length} trafionych, ${pudla.length} ${pudel(pudla.length)}` : null;
	const liniaDnia = typDnia ? `Typ dnia: ${znak(typDnia.status)} ${typDnia.home} – ${typDnia.away}${typDnia.score ? ` ${typDnia.score}` : ''}` : null;
	// Bez kursu: rozliczenie to wynik, a kurs zostaje w poście z samym kuponem.
	const liniaKuponu = kupon ? `Kupon dnia: ${kupon.status === 'won' ? '✅ wszedł' : '❌ nie wszedł'}` : null;
	const data = dm(date);

	// X: od pełnego do najkrótszego — najpierw odpada hashtag, potem kolejne pudła z nazwy (zostaje ich liczba).
	const zlozX = ({ ilePudel, zDniem = true, zKuponem = true, zTagiem = true }) => {
		const reszta = pudla.length - ilePudel;
		return [
			`📊 Rozliczenie · ${data}`,
			...(bilans ? [bilans] : []),
			...pudla.slice(0, ilePudel).map((p) => `❌ ${p.home} – ${p.away}: ${p.selection}${wynik(p)}`),
			...(reszta > 0 && ilePudel > 0 ? [`…i ${reszta} ${reszta === 1 ? 'inne pudło' : pudel(reszta) === 'pudła' ? 'inne pudła' : 'innych pudeł'}`] : []),
			...(zDniem && liniaDnia ? [liniaDnia] : []),
			...(zKuponem && liniaKuponu ? [liniaKuponu] : []),
			'',
			`Wszystkie wyniki 👉 ${postUtmLink(siteUrl, 'recap', 'x')}`,
			'18+',
			...(zTagiem ? ['#rozliczenie #typy'] : []),
		].join('\n');
	};
	const proby = [];
	for (let n = pudla.length; n >= 0; n -= 1) proby.push(zlozX({ ilePudel: n }));
	for (let n = pudla.length; n >= 0; n -= 1) proby.push(zlozX({ ilePudel: n, zTagiem: false }));
	proby.push(zlozX({ ilePudel: 0, zTagiem: false, zKuponem: false }));
	proby.push(zlozX({ ilePudel: 0, zTagiem: false, zKuponem: false, zDniem: false }));
	const x = pierwszyWLimicie(proby);

	const facebook = (link) =>
		[
			`📊 Rozliczenie wczoraj · ${data}`,
			...(bilans ? [`${bilans}${rozliczone.length ? ` (${proc(won, rozliczone.length)}%)` : ''}`] : []),
			'',
			...rozliczone.map((p) => `${znak(p.status)} ${p.home} – ${p.away}: ${p.selection}${wynik(p)}`),
			...(liniaDnia || liniaKuponu ? [''] : []),
			...(liniaDnia ? [liniaDnia] : []),
			...(liniaKuponu ? [liniaKuponu] : []),
			'',
			'Pudła publikujemy tak samo jak trafienia — bez tego żadna skuteczność nic nie znaczy. Cała historia, z podziałem na rodzaje typów:',
			link,
			STOPKA_FB,
		].join('\n');

	const short = [
		`📊 Wczoraj (${data}) — ${bilans ? bilans.replace('Typy modelu: ', 'model: ') : 'rozliczenie'}`,
		...(pudla.length ? ['', 'Nie weszło:', ...pudla.slice(0, 5).map((p) => `❌ ${p.home} – ${p.away}: ${p.selection}${wynik(p)}`)] : []),
		...(pudla.length > 5 ? [`…i ${pudla.length - 5} więcej`] : []),
		...(liniaDnia || liniaKuponu ? [''] : []),
		...(liniaDnia ? [liniaDnia] : []),
		...(liniaKuponu ? [liniaKuponu] : []),
		'',
		'Pełna lista z trafieniami: link w bio 🔗',
		STOPKA_KROTKA,
		'#rozliczenie #piłkanożna #statystyka',
	].join('\n');

	return komplet({ kind: 'recap', siteUrl, x, facebook, short });
}

/* ---------- tydzień w liczbach ---------- */

/**
 * Tydzień w liczbach: typy modelu (trafione, obiecane, norma), typ dnia i kupon dnia.
 * `null`, gdy w tygodniu nic się nie rozliczyło.
 *
 * „Model zapowiadał średnio X%" stoi przy trafności celowo: 76% trafień to dobry wynik tylko wtedy,
 * gdy model obiecywał ok. 76%; obok norma („w przeciętnym meczu"), żeby liczba miała punkt odniesienia.
 *
 * @param {{ from: string, to: string, picks: { won: number, total: number, promised?: number|null, base?: number|null },
 *   daily?: { won: number, total: number }, coupon?: { won: number, total: number }, siteUrl: string }} input
 */
export function buildWeekVariants({ from, to, picks, daily = { won: 0, total: 0 }, coupon = { won: 0, total: 0 }, siteUrl }) {
	if (!(picks?.total > 0) && !(daily?.total > 0) && !(coupon?.total > 0)) return null;
	const okres = `${dm(from)}–${dm(to)}`;
	const linie = [
		...(picks?.total > 0 ? [`Typy modelu: ${picks.won} z ${picks.total} trafionych (${proc(picks.won, picks.total)}%)`] : []),
		...(picks?.total > 0 && Number.isFinite(picks.promised) ? [`Model zapowiadał średnio ${Math.round(picks.promised)}%`] : []),
		...(daily?.total > 0 ? [`Typ dnia: ${daily.won} z ${daily.total}`] : []),
		...(coupon?.total > 0 ? [`Kupon dnia: weszło ${coupon.won} z ${coupon.total}`] : []),
	];
	const pudla = picks?.total > 0 ? picks.total - picks.won : 0;

	const zlozX = ({ zTagiem = true, zObietnica = true }) =>
		[
			`📈 Tydzień w liczbach · ${okres}`,
			...linie.filter((l) => zObietnica || !l.startsWith('Model zapowiadał')),
			'',
			`Pełne rozliczenie 👉 ${postUtmLink(siteUrl, 'week', 'x')}`,
			'18+',
			...(zTagiem ? ['#statystyka #typy'] : []),
		].join('\n');
	const x = pierwszyWLimicie([zlozX({}), zlozX({ zTagiem: false }), zlozX({ zTagiem: false, zObietnica: false })]);

	const facebook = (link) =>
		[
			`📈 Tydzień w liczbach · ${okres}`,
			'',
			...linie,
			...(pudla > 0 ? [`Nie weszło: ${pudla} ${typow(pudla)} modelu`] : []),
			...(picks?.total > 0 && Number.isFinite(picks.base)
				? ['', `Dla porównania: w przeciętnym meczu te same zdarzenia wchodzą średnio w ${Math.round(picks.base)}% — to punkt odniesienia dla trafności modelu.`]
				: []),
			'',
			`Każdy typ z wynikiem, także pudła: ${link}`,
			STOPKA_FB,
		].join('\n');

	const short = [
		`📈 Tydzień ${okres} w liczbach`,
		'',
		...linie,
		...(pudla > 0 ? [`Nie weszło: ${pudla}`] : []),
		'',
		'Każdy typ z wynikiem: link w bio 🔗',
		STOPKA_KROTKA,
		'#statystyka #piłkanożna #analizameczu',
	].join('\n');

	return komplet({ kind: 'week', siteUrl, x, facebook, short });
}
