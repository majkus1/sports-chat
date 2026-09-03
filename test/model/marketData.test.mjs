import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Kursy zamknięcia z archiwum football-data.co.uk — parser, dopasowanie i zdjęcie marży.
 *
 * Bez sieci: testy karmią funkcje spreparowanym CSV. Pilnują, że najpierw brane jest
 * zamknięcie Pinnacle, że po zdjęciu marży prawdopodobieństwa sumują się do jedności
 * i — najważniejsze — że dwie konwencje nazw drużyn spotykają się we właściwym wierszu,
 * a nie w sąsiednim.
 */

const {
	parseCsv,
	parseDate,
	closingOdds,
	demargin,
	rowsToMatches,
	matchFixture,
	marketProbabilities,
	nameSimilarity,
	normalizeTeamName,
	seasonCode,
	footballDataUrl,
	loadMarketData,
} = await import('../../lib/model/marketData.mjs');

const CSV = [
	'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,B365H,B365D,B365A,PSH,PSD,PSA,B365>2.5,B365<2.5,PSCH,PSCD,PSCA,PC>2.5,PC<2.5',
	'E0,17/08/2024,15:00,Man United,Fulham,1,0,H,1.45,4.5,7.0,1.47,4.6,7.2,1.8,2.0,1.44,4.7,7.5,1.85,2.05',
	'E0,17/08/2024,15:00,Ipswich,Liverpool,0,2,A,7.5,4.8,1.4,7.8,4.9,1.42,1.7,2.2,,,,,',
	"E0,18/08/2024,16:30,Nott'm Forest,Bournemouth,1,1,D,2.6,3.3,2.8,2.65,3.35,2.85,1.95,1.9,2.55,3.4,2.9,1.9,1.95",
	'E0,24/08/24,15:00,Sheffield Weds,Leeds,2,0,H,3.0,3.4,2.3,3.1,3.45,2.35,1.9,1.9,3.05,3.5,2.3,1.88,1.98',
].join('\r\n');

describe('parser', () => {
	test('czyta nagłówek i wiersze z CRLF, apostrof w nazwie nie psuje kolumn', () => {
		const rows = parseCsv(CSV);
		assert.equal(rows.length, 4);
		assert.equal(rows[2].HomeTeam, "Nott'm Forest");
		assert.equal(rows[2].FTAG, '1');
	});

	test('data w obu zapisach roku', () => {
		assert.equal(parseDate('17/08/2024'), '2024-08-17');
		assert.equal(parseDate('24/08/24'), '2024-08-24');
		assert.equal(parseDate('2024-08-17'), null);
	});

	test('sezon 2024 to plik „2425"', () => {
		assert.equal(seasonCode(2024), '2425');
		assert.equal(footballDataUrl(39, 2024), 'https://www.football-data.co.uk/mmz4281/2425/E0.csv');
		assert.equal(footballDataUrl(106, 2024), null, 'Ekstraklasy nie ma w archiwum');
	});
});

describe('kursy zamknięcia', () => {
	const rows = parseCsv(CSV);

	test('zamknięcie Pinnacle ma pierwszeństwo przed otwarciem', () => {
		const k = closingOdds(rows[0]);
		assert.equal(k.home, 1.44);
		assert.equal(k.source, 'pinnacle-close');
		assert.equal(k.over25.over, 1.85);
	});

	test('bez zamknięcia spada do otwarcia Pinnacle, a próg 2.5 do Bet365', () => {
		const k = closingOdds(rows[1]);
		assert.equal(k.home, 7.8);
		assert.equal(k.source, 'pinnacle-open');
		assert.equal(k.over25.over, 1.7);
	});

	test('po zdjęciu marży prawdopodobieństwa sumują się do jedności', () => {
		const p = demargin([1.44, 4.7, 7.5]);
		assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
		assert.ok(p[0] > 0.66 && p[0] < 0.7, 'kurs 1,44 to około 68% po marży, nie 69,4%');
	});

	test('kurs 1,04 to około 92% po zdjęciu typowej marży, nie 96%', () => {
		// Realny rynek przy 1,04: remis ~17, gość ~51 — nadwyżka ~4%.
		const [p] = demargin([1.04, 17, 51]);
		assert.ok(p > 0.91 && p < 0.94, `wyszło ${p}`);
	});

	test('kurs niedodatni albo pusty dyskwalifikuje komplet', () => {
		assert.equal(demargin([1.5, null, 3]), null);
		assert.equal(demargin([1.5, 0.9, 3]), null);
	});
});

describe('nazwy drużyn', () => {
	test('skróty archiwum spotykają pełne nazwy dostawcy', () => {
		for (const [a, b] of [
			['Man United', 'Manchester United'],
			["Nott'm Forest", 'Nottingham Forest'],
			['Ath Madrid', 'Atletico Madrid'],
			['Ein Frankfurt', 'Eintracht Frankfurt'],
			['Paris SG', 'Paris Saint Germain'],
			['Sheffield Utd', 'Sheffield United'],
			['Preston', 'Preston North End'],
			['Bayern Munich', 'Bayern München'],
			['St Etienne', 'Saint-Etienne'],
			['Wolves', 'Wolverhampton'],
		]) {
			assert.ok(nameSimilarity(a, b) >= 0.6, `${a} ~ ${b}: ${nameSimilarity(a, b).toFixed(2)}`);
		}
	});

	test('sąsiedzi z tego samego miasta się nie mylą', () => {
		assert.ok(nameSimilarity('Sheffield Weds', 'Sheffield Wednesday') > nameSimilarity('Sheffield Weds', 'Sheffield United'));
		assert.ok(nameSimilarity('Dundee', 'Dundee') > nameSimilarity('Dundee', 'Dundee United'));
		assert.ok(nameSimilarity('Man City', 'Manchester City') > nameSimilarity('Man City', 'Manchester United'));
	});

	test('przedrostki klubowe i znaki diakrytyczne nie liczą się do porównania', () => {
		assert.deepEqual(normalizeTeamName('1. FC Köln'), ['koln']);
		assert.deepEqual(normalizeTeamName('AC Milan'), ['milan']);
	});
});

describe('dopasowanie meczu do wiersza', () => {
	const mecze = rowsToMatches(parseCsv(CSV));

	test('po dacie i nazwach z konwencji dostawcy', () => {
		const wiersz = matchFixture(
			{ date: '2024-08-17T14:00:00+00:00', homeName: 'Manchester United', awayName: 'Fulham' },
			mecze
		);
		assert.equal(wiersz?.home, 'Man United');
		assert.equal(wiersz.homeGoals, 1);
	});

	test('mecz o północy czasu UTC trafia w dzień sąsiedni', () => {
		const wiersz = matchFixture(
			{ date: '2024-08-19T00:30:00+00:00', homeName: 'Nottingham Forest', awayName: 'AFC Bournemouth' },
			mecze
		);
		assert.equal(wiersz?.away, 'Bournemouth');
	});

	test('inny przeciwnik tego samego dnia nie jest dopasowaniem', () => {
		assert.equal(
			matchFixture({ date: '2024-08-17T14:00:00+00:00', homeName: 'Manchester United', awayName: 'Liverpool' }, mecze),
			null
		);
	});

	test('prawdopodobieństwa rynkowe wiersza mają komplet 1X2 i próg 2.5, gdy jest', () => {
		const mp = marketProbabilities(mecze[0]);
		assert.ok(Math.abs(mp.home + mp.draw + mp.away - 1) < 1e-12);
		assert.ok(mp.over25 > 0.5, 'kurs 1,85 na powyżej to ponad połowa');
		assert.equal(marketProbabilities(mecze[1]).over25 > 0, true);
	});
});

describe('pobieranie archiwum', () => {
	test('błąd jednego pliku nie przerywa reszty', async () => {
		const fetchImpl = async (url) =>
			url.includes('E0')
				? { ok: true, text: async () => CSV }
				: { ok: false, status: 404 };
		const { byLeague, rows, errors } = await loadMarketData([39, 140], [2024], { fetchImpl });

		assert.equal(rows, 4);
		assert.equal(byLeague.get(39).length, 4);
		assert.equal(byLeague.has(140), false);
		assert.equal(errors.length, 1);
	});
});
