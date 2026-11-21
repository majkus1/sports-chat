import Pick from '@/models/Pick';
import Coupon from '@/models/Coupon';
import { MAIN_STATS_LEAGUES } from '@/lib/football/leagues';
import { localDate, localMidnight } from '@/lib/time';

/**
 * Dane do postów „rozliczenie wczoraj" i „tydzień w liczbach" (`lib/growth/posts.js`) — sam odczyt.
 *
 * TA SAMA PULA CO PORANNY MAIL I SKUTECZNOŚĆ: typy modelu (`author: 'ai'`), wliczane do statystyk,
 * bez lig w okresie próbnym, rozliczone (`won`/`lost`; odwołane mecze nie są ani trafieniem, ani
 * pudłem). Post z liczbą inną niż ta na stronie, do której prowadzi link, podważyłby jedno i drugie.
 * Ten sam mecz z tą samą selekcją (raport i analiza) liczymy raz — jak `modelYesterday` w mailu.
 */

const pula = (od, doo) => ({
	author: 'ai',
	countsToStats: true,
	...MAIN_STATS_LEAGUES,
	status: { $in: ['won', 'lost'] },
	kickoff: { $gte: od, $lt: doo },
});

function bezPowtorzen(rows) {
	const widziane = new Set();
	return rows.filter((p) => {
		const klucz = `${p.fixtureId}:${JSON.stringify(p.normalized ?? p.selection)}`;
		if (widziane.has(klucz)) return false;
		widziane.add(klucz);
		return true;
	});
}

/** Wczorajsze rozliczone typy modelu: pudła pierwsze (post wymienia je z nazwy), potem trafienia. */
export async function yesterdayPicks(now = new Date()) {
	const od = localMidnight(localDate(now, -1));
	const doo = localMidnight(localDate(now));
	const rows = await Pick.find(pula(od, doo))
		.select('fixtureId homeName awayName selection status normalized finalScore kickoff')
		.sort({ kickoff: 1 })
		.limit(300)
		.lean();
	return {
		date: localDate(now, -1),
		picks: bezPowtorzen(rows)
			.map((p) => ({
				home: p.homeName,
				away: p.awayName,
				selection: p.selection,
				status: p.status,
				score: Number.isFinite(p.finalScore?.home) && Number.isFinite(p.finalScore?.away) ? `${p.finalScore.home}:${p.finalScore.away}` : null,
			}))
			.sort((a, b) => (a.status === b.status ? 0 : a.status === 'lost' ? -1 : 1)),
	};
}

/**
 * Ostatnie siedem pełnych dni (bez dzisiejszego): typy modelu z obiecanym procentem i normą,
 * typ dnia i kupon dnia.
 */
export async function weekNumbers(now = new Date()) {
	const odDnia = localDate(now, -7);
	const doDnia = localDate(now, -1);
	const od = localMidnight(odDnia);
	const doo = localMidnight(localDate(now));
	const [typy, dzienne, kupony] = await Promise.all([
		Pick.find({ ...pula(od, doo), duplicateOf: null }).select('fixtureId selection normalized status probability baseRate').limit(5000).lean(),
		Pick.find({ kind: 'daily', author: 'ai', status: { $in: ['won', 'lost'] }, kickoff: { $gte: od, $lt: doo } }).select('status').lean(),
		Coupon.find({ type: 'daily', date: { $gte: odDnia, $lte: doDnia }, status: { $in: ['won', 'lost'] } }).select('status').lean(),
	]);
	const unikalne = bezPowtorzen(typy);
	const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const liczby = (rows) => ({ won: rows.filter((r) => r.status === 'won').length, total: rows.length });
	return {
		from: odDnia,
		to: doDnia,
		picks: {
			...liczby(unikalne),
			promised: srednia(unikalne.map((p) => p.probability).filter(Number.isFinite)),
			base: srednia(unikalne.map((p) => p.baseRate).filter(Number.isFinite)),
		},
		daily: liczby(dzienne),
		coupon: liczby(kupony),
	};
}
