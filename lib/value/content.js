/**
 * Treść typów z wyższym kursem (zakładka w skuteczności, raport „Wyższe kursy").
 *
 * Szansa rynku zawsze pierwsza i zawsze obok procentu modelu — przy kursach 2,0+ model
 * zawyżał szansę (pomiar w `lib/value/select.js`). Bez nazw bukmacherów, bez stawek, 18+.
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
			statsHint:
				'Picks at odds from 2.0 shown by the assistant and in the “Higher odds” report. Every pick shown counts. The fair test: do they hit as often as the market said?',
			statsRecent: 'Recent picks',
			statsSmall: 'small sample — the numbers still swing',
			counts: { won: 'Hit', lost: 'Miss', pending: 'Pending' },
			legStatus: { won: 'Hit', lost: 'Miss', void: 'Void', live: 'In play', pending: 'Before kick-off' },
			warning:
				'Higher odds mean a lower chance: at odds of 2.0 the market gives about 50%, and in our measurements since September the model overrated such picks. Median odds of several bookmakers. Estimates, not sure things. 18+.',
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
		statsHint:
			'Typy z kursem od 2,0 pokazane przez asystenta i w raporcie „Wyższe kursy". Liczy się każdy pokazany typ. Uczciwa miara: czy trafiają tak często, jak mówił rynek.',
		statsRecent: 'Ostatnie typy',
		statsSmall: 'mała próba — liczby jeszcze się wahają',
		counts: { won: 'Trafione', lost: 'Chybione', pending: 'Czekają' },
		legStatus: { won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany', live: 'Mecz trwa', pending: 'Przed meczem' },
		warning:
			'Wyższy kurs to mniejsza szansa: przy kursie 2,0 rynek daje ok. 50%, a w naszym pomiarze od września model przy takich kursach zawyżał szansę. Kursy to mediana kilku bukmacherów. Szacunki, nie pewniaki. 18+.',
	};
}
