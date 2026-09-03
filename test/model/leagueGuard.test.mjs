import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Próg meczów na drużynę — zabezpieczenie, które odcina puchary od modelu.
 *
 * Backtest pokazał, że model przegrywa z częstościami w rozgrywkach pucharowych, a 84%
 * całej szkody pochodziło z Pucharu Anglii: log loss 1,66 wobec 1,04. Przyczyna jest
 * strukturalna, nie losowa — puchar daje setki drużyn po dwa mecze, z różnych poziomów
 * rozgrywkowych, więc oceny wychodzą z szumu. Liczba meczów w rozgrywkach tego nie łapie:
 * Puchar Anglii ma ich 869, czyli więcej niż niejedna liga.
 *
 * Te testy pilnują samej miary. Gdyby ktoś kiedyś zamienił medianę na średnią „bo prościej",
 * puchar znowu by przeszedł — kilka drużyn dochodzi do finału i rozgrywa po sześć spotkań.
 */

setupEnv();

const { medianMatchesPerTeam } = await import('@/lib/model');

/** Round-robin: każdy z każdym u siebie i na wyjeździe. */
function liga(druzyn) {
	const out = [];
	for (let i = 0; i < druzyn; i += 1) {
		for (let j = 0; j < druzyn; j += 1) {
			if (i !== j) out.push({ homeId: i, awayId: j });
		}
	}
	return out;
}

/**
 * Drabinka pucharowa: `rund` rund, w pierwszej `startowych` drużyn.
 * Połowa odpada po każdej rundzie, więc mediana meczów na drużynę zostaje przy jedności.
 */
function puchar(startowych, rund) {
	const out = [];
	let zostali = Array.from({ length: startowych }, (_, i) => i);
	for (let r = 0; r < rund && zostali.length > 1; r += 1) {
		const dalej = [];
		for (let i = 0; i + 1 < zostali.length; i += 2) {
			out.push({ homeId: zostali[i], awayId: zostali[i + 1] });
			dalej.push(zostali[i]);
		}
		zostali = dalej;
	}
	return out;
}

describe('mediana meczów na drużynę', () => {
	test('liga dwudziestodrużynowa daje pełny sezon na zespół', () => {
		assert.equal(medianMatchesPerTeam(liga(20)), 38);
	});

	test('drabinka pucharowa zostaje daleko poniżej progu', () => {
		const mecze = puchar(512, 9);

		assert.ok(mecze.length > 500, 'sama liczba meczów wygląda jak liga');
		// Połowa drużyn odpada po pierwszym meczu, więc mediana ledwie przekracza jedność.
		assert.ok(medianMatchesPerTeam(mecze) <= 2, `wyszło ${medianMatchesPerTeam(mecze)}`);
	});

	test('mediana nie daje się zawyżyć finalistom — średnia by się dała', () => {
		const mecze = puchar(256, 8);
		const licznik = new Map();
		for (const m of mecze) {
			licznik.set(m.homeId, (licznik.get(m.homeId) || 0) + 1);
			licznik.set(m.awayId, (licznik.get(m.awayId) || 0) + 1);
		}
		const srednia = [...licznik.values()].reduce((a, b) => a + b, 0) / licznik.size;

		assert.ok(srednia > medianMatchesPerTeam(mecze), 'średnia zawyża przez drużyny z późnych rund');
	});

	test('faza ligowa pucharu europejskiego przechodzi próg', () => {
		// 36 drużyn po 8 spotkań — to już round-robin, choć niepełny.
		const out = [];
		for (let i = 0; i < 36; i += 1) {
			for (let k = 1; k <= 4; k += 1) {
				out.push({ homeId: i, awayId: (i + k) % 36 });
			}
		}
		assert.ok(medianMatchesPerTeam(out) >= 6);
	});

	test('pusta i niepełna pula nie wywracają rachunku', () => {
		assert.equal(medianMatchesPerTeam([]), 0);
		assert.equal(medianMatchesPerTeam(null), 0);
		assert.equal(medianMatchesPerTeam([{ homeId: 1, awayId: 2 }]), 1);
	});

	test('parzysta liczba drużyn liczy medianę ze środkowej pary', () => {
		// Drużyny 1 i 2 po dwa mecze, 3 i 4 po jednym — mediana to (1 + 2) / 2.
		const mecze = [
			{ homeId: 1, awayId: 2 },
			{ homeId: 1, awayId: 3 },
			{ homeId: 2, awayId: 4 },
		];
		assert.equal(medianMatchesPerTeam(mecze), 1.5);
	});
});
