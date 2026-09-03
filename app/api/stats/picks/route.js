import mongoose from 'mongoose';
import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';
import { MARKET_GROUPS } from '@/lib/picks/markets';
import { BRIER_BASELINE, MIN_SETTLED_FOR_RATE, wilsonInterval } from '@/lib/picks/metrics';

/**
 * Skuteczność typów — globalna albo własna.
 *
 * Liczona agregacją w bazie, nie w JavaScripcie: przy kilkudziesięciu tysiącach typów
 * przesyłanie ich do aplikacji tylko po to, żeby je zliczyć, byłoby bezsensowne.
 *
 * Parametry:
 *   scope=global|me     zasięg (własny wymaga sesji)
 *   author=ai|user      kto wystawił typ; domyślnie `ai`
 *   kind=all|prematch|live|report
 *   days=30|90|all      okno czasowe liczone od daty meczu
 *
 * Filtr autora jest domyślnie ustawiony na `ai`, żeby dodanie typów użytkowników nie
 * zmieniło po cichu znaczenia liczby na stronie „skuteczność analiz AI".
 */

const KINDS = ['prematch', 'live', 'report'];
const AUTHORS = ['ai', 'user'];

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const scope = searchParams.get('scope') === 'me' ? 'me' : 'global';
	const kind = KINDS.includes(searchParams.get('kind')) ? searchParams.get('kind') : null;
	const daysParam = searchParams.get('days');
	const days = daysParam === 'all' ? null : Math.min(365, Math.max(1, Number(daysParam) || 90));

	const author = AUTHORS.includes(searchParams.get('author')) ? searchParams.get('author') : 'ai';

	const match = { author };
	if (kind) match.kind = kind;
	if (days) match.kickoff = { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) };

	/*
	 * Typy postawione na szczątkowych danych nie wchodzą do publicznej statystyki.
	 *
	 * `$ne: false` zamiast `true`, bo typy sprzed wprowadzenia tego pola nie mają go wcale —
	 * a nie ma powodu, żeby cała dotychczasowa historia zniknęła z panelu. Własną statystykę
	 * pokazujemy w całości: użytkownik ma widzieć wszystko, co dla niego wygenerowaliśmy.
	 */
	if (scope !== 'me') match.countsToStats = { $ne: false };

	if (scope === 'me') {
		const session = await getAuthenticatedUser();
		if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
		match.userId = new mongoose.Types.ObjectId(String(session.userId));
	}

	await connectToDb();

	/*
	 * Jedno przejście po kolekcji, trzy zestawienia naraz (`$facet`): licznik statusów,
	 * podział po rynkach i ostatnie rozstrzygnięcia. Trzy osobne zapytania czytałyby
	 * te same dokumenty trzy razy.
	 */
	const [result] = await Pick.aggregate([
		{ $match: match },
		{
			$facet: {
				statusy: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
				wgRodzaju: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { kind: '$kind', status: '$status' }, n: { $sum: 1 } } },
				],
				wgRynku: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { market: '$normalized.type', status: '$status' }, n: { $sum: 1 } } },
				],
				// Kalibracja: czy typy z wyższą deklarowaną pewnością faktycznie trafiają częściej.
				wgPewnosci: [
					{ $match: { status: { $in: ['won', 'lost'] }, confidence: { $ne: null } } },
					{
						$group: {
							_id: {
								bucket: {
									$switch: {
										branches: [
											{ case: { $gte: ['$confidence', 75] }, then: '75+' },
											{ case: { $gte: ['$confidence', 65] }, then: '65-74' },
										],
										default: '<65',
									},
								},
								status: '$status',
							},
							n: { $sum: 1 },
						},
					},
				],
				/*
				 * KALIBRACJA — najważniejsza tabela na tej trasie.
				 *
				 * Kubełki po 10 punktów deklarowanego prawdopodobieństwa zestawione z faktycznym
				 * odsetkiem trafień. Model skalibrowany trafia w 70% tam, gdzie deklaruje 70%.
				 * Jeśli kubełek 60–69 daje 58%, a 70–79 daje 88%, to znaczy, że liczby podawane
				 * użytkownikowi nie znaczą tego, co obiecują — i żadna średnia tego nie pokaże.
				 */
				wgPrawdopodobienstwa: [
					{ $match: { status: { $in: ['won', 'lost'] }, probability: { $ne: null } } },
					{
						$group: {
							_id: { $subtract: ['$probability', { $mod: ['$probability', 10] }] },
							n: { $sum: 1 },
							won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
							srednia: { $avg: '$probability' },
						},
					},
					{ $sort: { _id: 1 } },
				],
				/*
				 * Brier score liczony w bazie, żeby nie ściągać typów do aplikacji.
				 * Sumujemy kwadraty błędu; średnią wyliczamy po odebraniu wyniku.
				 */
				brier: [
					{ $match: { status: { $in: ['won', 'lost'] }, probability: { $ne: null } } },
					{
						$group: {
							_id: null,
							n: { $sum: 1 },
							suma: {
								$sum: {
									$pow: [
										{
											$subtract: [
												{ $divide: ['$probability', 100] },
												{ $cond: [{ $eq: ['$status', 'won'] }, 1, 0] },
											],
										},
										2,
									],
								},
							},
						},
					},
				],
				/*
				 * TRAFNOŚĆ WOBEC NORMY — jedyna liczba, która mówi, czy typy coś wnoszą.
				 *
				 * Procent trafień sam w sobie nie świadczy o niczym: typy na „gospodarz strzeli"
				 * trafią w 80%, bo tyle wynosi norma tego rynku bez żadnego modelu. Średnia norm
				 * tych samych typów to trafność, jaką dałoby czyste zgadywanie średniej ligowej —
				 * a różnica między nią a faktyczną trafnością jest dowodem umiejętności
				 * albo jego brakiem. Liczona tylko z typów, które mają normę zapisaną przy sobie.
				 */
				wzgledemNormy: [
					{ $match: { status: { $in: ['won', 'lost'] }, baseRate: { $ne: null } } },
					{
						$group: {
							_id: null,
							n: { $sum: 1 },
							sumaNorm: { $sum: '$baseRate' },
							won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
						},
					},
				],
				// Czy skuteczność zależy od klasy rozgrywek i od kompletności danych.
				wgPoziomuLigi: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { tier: '$leagueTier', status: '$status' }, n: { $sum: 1 } } },
				],
				wgJakosciDanych: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { quality: '$dataQuality', status: '$status' }, n: { $sum: 1 } } },
				],
				// Porównanie wersji instrukcji — jedyny sposób, żeby stwierdzić, czy zmiana pomogła.
				wgWersjiPromptu: [
					{ $match: { status: { $in: ['won', 'lost'] }, promptVersion: { $ne: null } } },
					{ $group: { _id: { version: '$promptVersion', status: '$status' }, n: { $sum: 1 } } },
				],
				ostatnie: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $sort: { settledAt: -1 } },
					{ $limit: 12 },
					{
						$project: {
							_id: 0,
							kind: 1,
							market: 1,
							selection: 1,
							status: 1,
							confidence: 1,
							homeName: 1,
							awayName: 1,
							leagueName: 1,
							kickoff: 1,
							finalScore: 1,
							fixtureId: 1,
						},
					},
				],
			},
		},
	]);

	/*
	 * Typy sprzed wprowadzenia pól kontekstowych nie mają ich wcale i wpadają pod klucz
	 * `undefined`. Nazywamy to wprost zamiast pokazywać surowy brak — historia nie znika
	 * z panelu, ale widać, że pochodzi sprzed pomiaru.
	 */
	const BRAK = 'nieznane';

	const licz = (rows, keyName) => {
		const out = {};
		for (const row of rows) {
			const key = row._id[keyName] ?? BRAK;
			out[key] = out[key] || { won: 0, lost: 0 };
			out[key][row._id.status] = row.n;
		}
		return Object.entries(out)
			.map(([key, v]) => {
				const settled = v.won + v.lost;
				return {
					key,
					label: keyName === 'market' ? (MARKET_GROUPS[key] ?? key) : key,
					won: v.won,
					lost: v.lost,
					settled,
					hitRate: settled ? Math.round((v.won / settled) * 100) : null,
					// Przedział ufności przy każdym przekroju — bez niego 3/3 wygląda
					// jak 100% skuteczności, a znaczy tyle co nic.
					interval: wilsonInterval(v.won, settled),
				};
			})
			.filter((row) => row.settled > 0)
			.sort((a, b) => b.settled - a.settled);
	};

	const statusy = Object.fromEntries((result?.statusy || []).map((r) => [r._id, r.n]));
	const won = statusy.won || 0;
	const lost = statusy.lost || 0;
	const settled = won + lost;

	const brierRow = result?.brier?.[0];
	const brier = brierRow?.n ? Number((brierRow.suma / brierRow.n).toFixed(4)) : null;

	/**
	 * Trafność zestawiona z normą tych samych typów.
	 *
	 * `expectedHitRate` to średnia norm — tyle trafiłoby zgadywanie średniej ligowej dla
	 * dokładnie tych selekcji. `edge` w punktach procentowych: dodatnia znaczy, że typy
	 * wnoszą coś ponad normę, ujemna — że gorzej byłoby nie typować wcale.
	 */
	const normaRow = result?.wzgledemNormy?.[0];
	const baseline = normaRow?.n
		? (() => {
				const expected = Math.round(normaRow.sumaNorm / normaRow.n);
				const actual = Math.round((100 * normaRow.won) / normaRow.n);
				return { settled: normaRow.n, expectedHitRate: expected, hitRate: actual, edge: actual - expected };
			})()
		: null;

	/**
	 * Kalibracja: kubełek deklarowanego prawdopodobieństwa vs. rzeczywistość.
	 *
	 * `gap` to różnica w punktach procentowych — dodatnia znaczy, że model był zbyt pewny
	 * siebie, ujemna że niedoszacował. Zero to model idealnie skalibrowany.
	 */
	const calibration = (result?.wgPrawdopodobienstwa || []).map((r) => {
		const actual = Math.round((100 * r.won) / r.n);
		const declared = Math.round(r.srednia);
		return {
			bucket: `${r._id}-${r._id + 9}`,
			declared,
			actual,
			gap: declared - actual,
			settled: r.n,
			interval: wilsonInterval(r.won, r.n),
		};
	});

	return Response.json(
		{
			scope,
			author,
			kind: kind || 'all',
			days: days || null,
			summary: {
				total: won + lost + (statusy.pending || 0) + (statusy.void || 0),
				settled,
				won,
				lost,
				pending: statusy.pending || 0,
				// Typy pominięte pokazujemy jawnie — ukrywanie ich sugerowałoby,
				// że rozliczamy wszystko, a tak nie jest.
				skipped: statusy.void || 0,
				hitRate: settled ? Math.round((won / settled) * 100) : null,
				// Granice, w których naprawdę mieści się skuteczność. Przy 47/68 to 57–79%,
				// a nie „69%" — i dopiero to jest uczciwą odpowiedzią.
				interval: wilsonInterval(won, settled),
				// Czy próba jest już na tyle duża, żeby procent cokolwiek znaczył.
				reliable: settled >= MIN_SETTLED_FOR_RATE,
				minSettledForRate: MIN_SETTLED_FOR_RATE,
				// Trafność wobec normy tych samych typów — patrz `wzgledemNormy`.
				baseline,
			},
			quality: {
				brier,
				brierBaseline: BRIER_BASELINE,
				// Prognozy gorsze od rzutu monetą to sygnał, że deklarowane liczby szkodzą.
				brierWorseThanCoinFlip: brier !== null && brier > BRIER_BASELINE,
				calibration,
			},
			byKind: licz(result?.wgRodzaju || [], 'kind'),
			byMarket: licz(result?.wgRynku || [], 'market'),
			byConfidence: licz(result?.wgPewnosci || [], 'bucket'),
			byLeagueTier: licz(result?.wgPoziomuLigi || [], 'tier'),
			byDataQuality: licz(result?.wgJakosciDanych || [], 'quality'),
			byPromptVersion: licz(result?.wgWersjiPromptu || [], 'version'),
			recent: result?.ostatnie || [],
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
}
