
/**
 * Treść typów z wyższym kursem (zakładka w skuteczności, raport „Wyższe kursy").
 *
 * Szansa rynku zawsze pierwsza i zawsze obok procentu modelu — przy kursach 2,0+ model
 * zawyżał szansę (pomiar w `lib/value/select.js`). Bez nazw bukmacherów, bez stawek, 18+.
 *
 * Zapowiedź krótko (22.11.2026): o dostępie i cenie mówi pod nią `ValueUpsell`, więc bez osobnego
 * zdania o planach i kredytach; „mniejsza szansa za wyższy kurs" raz — w `warning`.
 */

const liczba = (locale, v, digits = 2) =>
	Number.isFinite(v)
		? v.toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits })
		: '—';

export function valueContent(locale) {
	const kurs = (v) => liczba(locale, v);
	if (locale === 'en') {
		return {
			odds: kurs,
			tab: 'Higher odds',
			market: 'market',
			model: 'model',
			chances: (m, mo) => `market ${m}% · model ${mo}%`,
			statsEntered: (won, settled) => `${won} of ${settled} hit`,
			statsPromised: (m, mo, o) => `The market gave them ${m}% on average · the model ${mo}% · average odds ${kurs(o)}`,
			statsEmpty: 'No settled higher-odds picks yet.',
			statsHint: 'Every pick from odds 2.0 shown in the “Higher odds” report and by the assistant. The test: do they hit as often as the market said?',
			statsRecent: 'Recent picks',
			teaserKicker: 'Higher odds',
			teaserTitle: 'Picks from odds 2.0',
			teaserLead: 'Picks at odds from 2.0 — each with the market’s and the model’s chance.',
			teaserRecord: (won, settled, odds) => `So far ${won} of ${settled} hit · average odds ${kurs(odds)}`,
			teaserCta: 'Open the “Higher odds” report',
			teaserRecordLink: 'Full record',
			teaserShort: 'Lower chance for higher odds — honest market and model numbers. 18+.',
			statsSmall: 'small sample — the numbers still swing',
			counts: { won: 'Hit', lost: 'Miss', pending: 'Pending' },
			legStatus: { won: 'Hit', lost: 'Miss', void: 'Void', live: 'In play', pending: 'Before kick-off' },
			warning: 'Higher odds mean a lower chance — since September the model has overrated such picks. Median odds of several bookmakers. Estimates, not sure things. 18+.',
		};
	}
	return {
		odds: kurs,
		tab: 'Wyższy kurs',
		market: 'rynek',
		model: 'model',
		chances: (m, mo) => `rynek ${m}% · model ${mo}%`,
		statsEntered: (won, settled) => `${won} z ${settled} trafionych`,
		statsPromised: (m, mo, o) => `Rynek dawał im średnio ${m}% · model ${mo}% · średni kurs ${kurs(o)}`,
		statsEmpty: 'Nie ma jeszcze rozliczonych typów z wyższym kursem.',
		statsHint: 'Każdy typ od kursu 2,0 pokazany w raporcie „Wyższe kursy" i przez asystenta. Miara: czy trafiają tak często, jak mówił rynek.',
		statsRecent: 'Ostatnie typy',
		teaserKicker: 'Wyższe kursy',
		teaserTitle: 'Typy od kursu 2,0',
		teaserLead: 'Typy z kursem od 2,0 — przy każdym szansa według rynku i modelu.',
		teaserRecord: (won, settled, odds) => `Dotąd ${won} z ${settled} trafionych · średni kurs ${kurs(odds)}`,
		teaserCta: 'Otwórz raport „Wyższe kursy"',
		teaserRecordLink: 'Pełny bilans',
		teaserShort: 'Mniejsza szansa za wyższy kurs — uczciwe liczby rynku i modelu. 18+.',
		statsSmall: 'mała próba — liczby jeszcze się wahają',
		counts: { won: 'Trafione', lost: 'Chybione', pending: 'Czekają' },
		legStatus: { won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany', live: 'Mecz trwa', pending: 'Przed meczem' },
		warning: 'Wyższy kurs to mniejsza szansa — od września model przy takich kursach zawyżał szansę. Kursy to mediana kilku bukmacherów. Szacunki, nie pewniaki. 18+.',
	};
}
