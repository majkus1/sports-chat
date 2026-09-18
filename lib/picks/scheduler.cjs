/**
 * Codzienne rozliczanie typów — harmonogram wbudowany w serwer socketów.
 *
 * Dlaczego tutaj, a nie w systemowym cronie: `server.js` i tak chodzi bez przerwy pod PM2,
 * więc wgranie kodu na serwer wystarcza, żeby rozliczanie ruszyło. Nie trzeba pamiętać
 * o `crontab -e` przy każdej nowej maszynie ani trzymać konfiguracji poza repozytorium.
 *
 * Zadanie nie liczy niczego samo — woła istniejącą trasę `/api/cron/settle-picks`
 * po pętli lokalnej. Dzięki temu logika rozliczania ma jedną implementację, a ten plik
 * odpowiada wyłącznie za „kiedy".
 *
 * Powtórne uruchomienie jest nieszkodliwe: rozliczane są tylko typy ze statusem `pending`,
 * więc drugi przebieg tego samego dnia po prostu nic nie znajdzie.
 *
 * Wyłączenie: `SETTLE_PICKS_ENABLED=false` (np. na maszynie deweloperskiej).
 * Godzina:    `SETTLE_PICKS_HOUR` (domyślnie 4 rano czasu serwera).
 */

const DEFAULT_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Ile milisekund do najbliższego wystąpienia podanej godziny. */
function msUntilHour(hour) {
	const now = new Date();
	const next = new Date(now);
	next.setHours(hour, 0, 0, 0);
	if (next <= now) next.setTime(next.getTime() + DAY_MS);
	return next.getTime() - now.getTime();
}

async function runSettlement(baseUrl, secret) {
	const controller = new AbortController();
	// Rozliczenie kilkuset typów to kilka paczek po 20 meczów — pięć minut wystarcza
	// z zapasem, a nieskończone oczekiwanie zawiesiłoby harmonogram.
	const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);

	try {
		const response = await fetch(`${baseUrl}/api/cron/settle-picks`, {
			method: 'POST',
			headers: { 'x-internal-secret': secret },
			signal: controller.signal,
		});

		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			console.error('[picks] rozliczenie odrzucone:', response.status, body.error || '');
			return;
		}
		console.log('[picks] rozliczenie dobowe:', JSON.stringify(body));
	} catch (error) {
		// Błąd jednego przebiegu nie może zatrzymać harmonogramu — kolejny spróbuje jutro.
		console.error('[picks] rozliczenie nie powiodło się:', error.message);
	} finally {
		clearTimeout(timer);
	}
}

/** Uruchamia dobowy harmonogram. Wywoływane raz, przy starcie serwera socketów. */
function startPickSettlementSchedule() {
	if (String(process.env.SETTLE_PICKS_ENABLED).toLowerCase() === 'false') {
		console.log('[picks] harmonogram rozliczania wyłączony (SETTLE_PICKS_ENABLED=false)');
		return;
	}

	const secret = process.env.INTERNAL_API_SECRET || '';
	if (!secret) {
		console.warn('[picks] brak INTERNAL_API_SECRET — harmonogram rozliczania nieaktywny');
		return;
	}

	const hour = Number(process.env.SETTLE_PICKS_HOUR);
	const targetHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR;
	const baseUrl = (process.env.NEXT_INTERNAL_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

	const schedule = () => {
		const delay = msUntilHour(targetHour);
		const timer = setTimeout(async () => {
			await runSettlement(baseUrl, secret);
			schedule();
		}, delay);
		// Oczekujący timer nie może utrzymywać procesu przy życiu przy zamykaniu serwera.
		timer.unref?.();

		const hours = (delay / 3600000).toFixed(1);
		console.log(`[picks] rozliczanie zaplanowane na ${targetHour}:00 (za ${hours} h)`);
	};

	schedule();
}

module.exports = { startPickSettlementSchedule, msUntilHour };

/*
 * PORANNY MAIL — 8:00 CZASU POLSKIEGO, NIE SERWERA.
 *
 * Rozliczanie typów liczy godzinę w czasie serwera (UTC) i to jest w porządku: nikt nie
 * czeka na nie o konkretnej godzinie. Mail ma przyjść przed kawą, a serwer stoi w UTC,
 * więc godzinę liczymy w Europe/Warsaw — inaczej zimą przychodziłby o 9:00, latem o 10:00.
 */
const MORNING_DEFAULT_HOUR = 8;
const MORNING_TZ = 'Europe/Warsaw';

/** Ile milisekund do najbliższej pełnej godziny `hour` w strefie `MORNING_TZ`. */
function msUntilWarsawHour(hour, now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: MORNING_TZ,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(now);
	const get = (type) => Number(parts.find((p) => p.type === type).value) % 24;
	const secondsNow = get('hour') * 3600 + get('minute') * 60 + get('second');
	let delta = hour * 3600 - secondsNow;
	if (delta <= 0) delta += 24 * 3600;
	return delta * 1000;
}

async function runMorningEmail(baseUrl, secret) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
	try {
		const response = await fetch(`${baseUrl}/api/cron/morning-email`, {
			method: 'POST',
			headers: { 'x-internal-secret': secret },
			signal: controller.signal,
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			console.error('[morning] wysyłka odrzucona:', response.status, body.error || '');
			return;
		}
		console.log('[morning] poranny mail:', JSON.stringify(body));
	} catch (error) {
		console.error('[morning] wysyłka nie powiodła się:', error.message);
	} finally {
		clearTimeout(timer);
	}
}

function startMorningEmailSchedule() {
	if (String(process.env.MORNING_EMAIL_ENABLED).toLowerCase() === 'false') {
		console.log('[morning] harmonogram wyłączony (MORNING_EMAIL_ENABLED=false)');
		return;
	}
	const secret = process.env.INTERNAL_API_SECRET || '';
	if (!secret) {
		console.warn('[morning] brak INTERNAL_API_SECRET — harmonogram nieaktywny');
		return;
	}
	const hour = Number(process.env.MORNING_EMAIL_HOUR);
	const targetHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : MORNING_DEFAULT_HOUR;
	const baseUrl = (process.env.NEXT_INTERNAL_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

	const schedule = () => {
		const delay = msUntilWarsawHour(targetHour);
		const timer = setTimeout(async () => {
			await runMorningEmail(baseUrl, secret);
			schedule();
		}, delay);
		timer.unref?.();
		console.log(`[morning] poranny mail zaplanowany na ${targetHour}:00 czasu polskiego (za ${(delay / 3600000).toFixed(1)} h)`);
	};
	schedule();
}

module.exports.startMorningEmailSchedule = startMorningEmailSchedule;
module.exports.msUntilWarsawHour = msUntilWarsawHour;

/*
 * Strzały z rozegranych meczów — cechy rynku „powyżej 2,5 gola".
 *
 * Nocą, bo wtedy dostawca ma już statystyki wieczornych meczów, a aplikacja nie potrzebuje
 * limitu zapytań na nic innego. Godzina po polsku z tego samego powodu co mail: ma być
 * po ostatnich meczach, a przed porannym przeliczeniem modelu (6 h cache).
 */
const FIXTURE_STATS_HOUR = 3;

async function runFixtureStats(baseUrl, secret) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
	try {
		const response = await fetch(`${baseUrl}/api/cron/fixture-stats`, {
			method: 'POST',
			headers: { 'x-internal-secret': secret },
			signal: controller.signal,
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			console.error('[fixture-stats] przebieg odrzucony:', response.status, body.error || '');
			return;
		}
		console.log('[fixture-stats] strzały:', JSON.stringify(body));
	} catch (error) {
		console.error('[fixture-stats] przebieg nie powiódł się:', error.message);
	} finally {
		clearTimeout(timer);
	}
}

function startFixtureStatsSchedule() {
	if (String(process.env.FIXTURE_STATS_ENABLED).toLowerCase() === 'false') {
		console.log('[fixture-stats] harmonogram wyłączony (FIXTURE_STATS_ENABLED=false)');
		return;
	}
	const secret = process.env.INTERNAL_API_SECRET || '';
	if (!secret) {
		console.warn('[fixture-stats] brak INTERNAL_API_SECRET — harmonogram nieaktywny');
		return;
	}
	const baseUrl = (process.env.NEXT_INTERNAL_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

	const schedule = () => {
		const delay = msUntilWarsawHour(FIXTURE_STATS_HOUR);
		const timer = setTimeout(async () => {
			await runFixtureStats(baseUrl, secret);
			schedule();
		}, delay);
		timer.unref?.();
		console.log(`[fixture-stats] zbieranie strzałów zaplanowane na ${FIXTURE_STATS_HOUR}:00 czasu polskiego (za ${(delay / 3600000).toFixed(1)} h)`);
	};
	schedule();
}

module.exports.startFixtureStatsSchedule = startFixtureStatsSchedule;
