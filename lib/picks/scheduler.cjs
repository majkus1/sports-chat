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
