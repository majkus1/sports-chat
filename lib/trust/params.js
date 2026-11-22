import { mergeSearch, paramValue } from '@/lib/urlState';

/**
 * Parametry rejestru typów — wspólne dla strony (adres), trasy API i odnośników ze strony
 * głównej. Osobny plik bez zależności od bazy i modelu, bo importuje go komponent kliencki:
 * `lib/trust/register.js` ciągnie za sobą politykę typów i nie ma czego szukać w przeglądarce.
 */

/** Okresy (dni wstecz od daty meczu). */
export const REGISTER_PERIODS = ['7', '30', '90', 'all'];
export const DEFAULT_PERIOD = '30';

/** Rynki — `normalized.type` typu. */
export const REGISTER_MARKETS = ['all', 'matchWinner', 'doubleChance', 'teamGoals', 'totalGoals'];
export const DEFAULT_MARKET = 'all';

/** Liga: `all` albo identyfikator ligi u dostawcy. */
export const DEFAULT_LEAGUE = 'all';
export const isLeagueParam = (raw) => raw === 'all' || /^[1-9]\d{0,6}$/.test(raw);

export const REGISTER_PAGE_SIZE = 25;

/**
 * Poniżej tylu typów z CLV nie wyrokujemy. Przy rozrzucie CLV ok. 3–4% błąd średniej ze stu
 * typów to ±0,7 pkt — mniej i werdykt zależałby od dwóch, trzech meczów.
 */
export const MIN_CLV_SAMPLE = 100;

/*
 * Widok strony skuteczności: dotychczasowe statystyki albo rejestr. W adresie jako `?view=register`,
 * jak zakładki i okresy (`lib/urlState`) — „Wstecz" z meczu i wysłany komuś link otwierają rejestr.
 */
export const ACCURACY_VIEWS = ['stats', 'register'];
export const DEFAULT_VIEW = 'stats';

/** Parametry rejestru w adresie. Nazwy różne od `kind`/`days` statystyk, żeby się nie nadpisywały. */
export const REGISTER_PARAMS = { period: 'period', market: 'market', league: 'league', page: 'page' };

/**
 * Adres rejestru, np. ze strony głównej: `/pilka-nozna/skutecznosc?view=register`.
 * Wartości domyślne nie trafiają do adresu.
 */
export function registerHref({ period = DEFAULT_PERIOD, market = DEFAULT_MARKET, league = DEFAULT_LEAGUE } = {}) {
	return `/pilka-nozna/skutecznosc${mergeSearch('', {
		view: 'register',
		period: paramValue(period, DEFAULT_PERIOD),
		market: paramValue(market, DEFAULT_MARKET),
		league: paramValue(String(league), DEFAULT_LEAGUE),
	})}`;
}
