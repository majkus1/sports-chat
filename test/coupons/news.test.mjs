import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Sprawdzanie wiadomości przed publikacją płatnego kuponu — odczyt werdyktu i polecenie.
 * Bez sieci: wyszukiwarka podstawiona. Pilnujemy, że werdykt czytamy z OSTATNIEJ linii, że
 * nieczytelna odpowiedź i błąd wyszukiwania NIE odrzucają typu (zostaje jako niesprawdzony).
 */

setupEnv();
const { parseVerdict, newsPrompt, checkLegNews } = await import('@/lib/coupons/news');

const LEG = {
	homeName: 'Lech Poznań',
	awayName: 'Legia',
	league: 'Ekstraklasa',
	kickoff: '2099-01-02T17:00:00Z',
	selection: 'Lech Poznań (gospodarze)',
};

describe('werdykt', () => {
	test('OK i RYZYKO z powodem, także z formatowaniem markdown', () => {
		assert.deepEqual(parseVerdict('- fakt (12.10)\nWERDYKT: OK'), { verdict: 'ok', reason: null });
		assert.deepEqual(parseVerdict('- Ishak kontuzjowany (17.10)\n**WERDYKT: RYZYKO — najlepszy strzelec Lecha nie zagra**'), {
			verdict: 'risk',
			reason: 'najlepszy strzelec Lecha nie zagra',
		});
		assert.equal(parseVerdict('werdykt: ryzyko - rotacja przed pucharem').verdict, 'risk');
	});

	test('liczy się ostatni werdykt; bez werdyktu — nieznany (typ zostaje)', () => {
		assert.equal(parseVerdict('WERDYKT: RYZYKO — x\npoprawka\nWERDYKT: OK').verdict, 'ok');
		assert.deepEqual(parseVerdict('Brak istotnych wiadomości.'), { verdict: 'unknown', reason: null });
		assert.deepEqual(parseVerdict(''), { verdict: 'unknown', reason: null });
	});
});

describe('wyszukanie', () => {
	test('polecenie zawiera mecz, typ i format werdyktu; bez porad zakładowych', () => {
		const p = newsPrompt(LEG);
		assert.match(p, /Lech Poznań – Legia/);
		assert.match(p, /Sprawdzany typ: Lech Poznań \(gospodarze\)/);
		assert.match(p, /WERDYKT: OK/);
		assert.match(p, /Nie podawaj kursów/);
	});

	test('źródła z wyszukania; błąd wyszukiwarki — typ niesprawdzony, nie odrzucony', async () => {
		const ok = await checkLegNews(LEG, {
			search: async () => ({
				text: 'WERDYKT: RYZYKO — rotacja',
				sources: [
					{ title: 'A', url: 'https://a' },
					{ title: 'B', url: 'https://b' },
				],
				meta: { costUsd: 0 },
			}),
		});
		assert.equal(ok.verdict, 'risk');
		assert.equal(ok.sources.length, 2);
		const blad = await checkLegNews(LEG, {
			search: async () => {
				throw new Error('timeout');
			},
		});
		assert.deepEqual(blad, { verdict: 'unknown', reason: null, sources: [] });
	});
});
