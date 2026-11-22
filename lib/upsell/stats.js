import connectToDb from '@/lib/db';
import UpsellStat from '@/models/UpsellStat';
import { localDate } from '@/lib/time';
import { EVENT_FIELD, UPSELL_PLACEMENTS, isPlacement } from '@/lib/upsell/placements';

/**
 * Zapis i odczyt licznika okien zakupu (`models/UpsellStat.js`).
 *
 * Zapis to jeden `$inc` z `upsert` — atomowy, więc dwa równoległe kliknięcia nie gubią się
 * nawzajem, a pierwszy wpis dnia sam zakłada dokument. Nieznane miejsce albo zdarzenie
 * po cichu odpada: licznik nie może przyjmować dowolnych nazw z przeglądarki.
 *
 * Błąd zapisu nigdy nie wychodzi wyżej — pomiar nie może wywrócić płatności ani strony.
 *
 * @param {{ placement: string, event: string, day?: string }} p `day` tylko w testach (daty 2099)
 * @returns {Promise<boolean>} czy zapisano
 */
export async function recordUpsell({ placement, event, day = localDate() }) {
	const pole = EVENT_FIELD[event];
	if (!pole || !isPlacement(placement)) return false;
	try {
		await connectToDb();
		await UpsellStat.updateOne({ day, placement }, { $inc: { [pole]: 1 } }, { upsert: true });
		return true;
	} catch (error) {
		console.warn('[upsell] nie udało się zapisać licznika:', error.message);
		return false;
	}
}

/**
 * Zestawienie dla panelu admina: sumy per miejsce za ostatnie `days` dni i rozbicie per dzień.
 *
 * Konwersje liczymy z sum, nie średnią dziennych procentów — dzień z jednym wyświetleniem
 * i jednym kliknięciem (100%) nie może ważyć tyle co dzień z setką.
 *
 * @param {{ days?: number, today?: string }} [opcje]
 */
export async function upsellSummary({ days = 14, today = localDate() } = {}) {
	const od = shiftDay(today, -(days - 1));
	await connectToDb();
	const wiersze = await UpsellStat.find({ day: { $gte: od, $lte: today } })
		.sort({ day: -1, placement: 1 })
		.lean();

	const puste = () => ({ views: 0, clicks: 0, checkouts: 0, purchases: 0 });
	const razem = Object.fromEntries(Object.keys(UPSELL_PLACEMENTS).map((p) => [p, puste()]));
	for (const w of wiersze) {
		const s = (razem[w.placement] ||= puste());
		for (const pole of Object.values(EVENT_FIELD)) s[pole] += w[pole] || 0;
	}

	const procent = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);
	const miejsca = Object.entries(razem)
		.map(([placement, s]) => ({
			placement,
			label: UPSELL_PLACEMENTS[placement] || placement,
			...s,
			ctr: procent(s.clicks, s.views),
			checkoutRate: procent(s.checkouts, s.clicks),
			purchaseRate: procent(s.purchases, s.checkouts),
		}))
		.sort((a, b) => b.clicks - a.clicks || b.views - a.views);

	return { from: od, to: today, placements: miejsca, rows: wiersze };
}

/** `YYYY-MM-DD` przesunięte o `delta` dni — rachunek na dacie bez strefy, w południe UTC. */
export function shiftDay(day, delta) {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}
