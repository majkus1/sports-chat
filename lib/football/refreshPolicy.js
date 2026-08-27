/**
 * Kiedy odświeżać dane meczu w otwartym pokoju.
 *
 * Reguła jest osobno, bo decyduje o tym, czy strona otwarta przed gwizdkiem sama przejdzie
 * w tryb live — a tego nie da się sprawdzić klikaniem: trzeba by czekać na start meczu.
 */

/**
 * Ile przed gwizdkiem zaczynamy nasłuchiwać startu.
 *
 * Dostawca przełącza status z opóźnieniem, a godziny bywają przesuwane, więc zaczynamy
 * wcześniej i pytamy dalej długo po nominalnej godzinie rozpoczęcia.
 */
export const KICKOFF_WATCH_MS = 5 * 60_000;

/**
 * @param {object} fixture znormalizowany mecz z pakietu (`bundle.fixture`)
 * @param {number} [now] znacznik czasu — parametr istnieje dla testów
 * @returns {boolean} czy sięgnąć po świeże dane
 */
export function shouldRefresh(fixture, now = Date.now()) {
	const status = fixture?.status;
	if (!status) return false;

	// Mecz w toku: wynik i minuta zmieniają się w czasie oglądania.
	if (status.isLive) return true;

	/*
	 * Przerwa w trakcie gry (SUSP/INT) to stan chwilowy — sędzia może wznowić spotkanie
	 * za kilka minut. Wcześniej wpadała do jednego worka z odwołaniem i odświeżanie
	 * milkło na dobre, więc wznowiony mecz zostawał na stronie zamrożony.
	 */
	if (status.isInterrupted) return true;

	// Po ostatnim gwizdku, przy przełożeniu i przy odwołaniu nic już się nie zmieni.
	if (status.isFinished || status.isPostponed || status.isCancelled) return false;

	const kickoff = Date.parse(fixture.date);
	if (!Number.isFinite(kickoff)) return false;

	// Przed gwizdkiem pytamy tylko w oknie startowym — inaczej mecz otwarty rano
	// odpytywałby serwer przez cały dzień bez powodu.
	return now >= kickoff - KICKOFF_WATCH_MS;
}
