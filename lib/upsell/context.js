/**
 * Który baner zakupu pokazać zalogowanemu bez planu — czysta funkcja (testy: `test/upsell`).
 *
 * Najwyżej JEDEN baner naraz i tylko w trzech sytuacjach, bo baner przy każdej odsłonie byłby
 * dokładnie tym „nachalnym", którego mamy unikać. Kolejność:
 *
 * 1. Ostatni dzień próby — jutro znikają liczby przy typach, kupony 3-/5-dniowe i live; to
 *    jedyny moment, w którym strata jest konkretna i bliska.
 * 2. Typ z analizy użytkownika wszedł (rozliczony w ostatnich 72 godzinach) — chwila, w której
 *    produkt właśnie udowodnił wartość. Propozycja: raport całej kolejki zamiast jednego meczu.
 * 3. Próba przy ok. 80% puli analiz, pytań albo raportów — za chwilę pula się skończy, a przepustka
 *    na 7 dni jest tańsza niż pakiet kredytów, który by ją zastąpił.
 *
 * Próg 80%: przy puli próby 15 analiz to 12 zużytych, przy 50 pytaniach — 40. Wcześniej byłoby
 * przedwcześnie (konto dopiero się rozkręca), później — za późno, bo zostaje jedna-dwie operacje.
 * Raporty (pula 2) liczą się dopiero przy 2/2, bo 1/2 to 50%.
 */

export const NEAR_LIMIT = 0.8;
/** Jak długo po rozliczeniu trafiony typ jest „świeży" — weekend z poniedziałkowym wejściem. */
export const WIN_FRESH_MS = 72 * 3600 * 1000;

const KINDS_NEAR_LIMIT = ['analysis', 'aiChat', 'report'];

/**
 * @param {{ paid: boolean, trialDaysLeft: number, usage: Record<string, {limit:number|null, used:number}>,
 *   recentWin?: object|null, now?: Date }} p
 * @returns {{ placement: string, data: object } | null}
 */
export function pickBanner({ paid, trialDaysLeft = 0, usage = {}, recentWin = null, now = new Date() }) {
	if (paid) return null;

	if (trialDaysLeft === 1) return { placement: 'trial_last_day', data: {} };

	const settled = recentWin?.settledAt ? new Date(recentWin.settledAt).getTime() : NaN;
	if (Number.isFinite(settled) && now.getTime() - settled <= WIN_FRESH_MS) {
		return {
			placement: 'analysis_win',
			data: { home: recentWin.homeName, away: recentWin.awayName, selection: recentWin.selection },
		};
	}

	if (trialDaysLeft > 0) {
		for (const kind of KINDS_NEAR_LIMIT) {
			const u = usage[kind];
			if (!u || !Number.isFinite(u.limit) || u.limit <= 0) continue;
			if (u.used / u.limit >= NEAR_LIMIT) {
				return { placement: 'trial_near_limit', data: { kind, used: u.used, limit: u.limit } };
			}
		}
	}

	return null;
}
