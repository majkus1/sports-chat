import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Strona „Jak to działa" — treść, która MUSI zgadzać się z kodem.
 *
 * To jedyne miejsce w serwisie, gdzie opisujemy własną metodę czytelnikowi. Zdanie
 * „typ wystawiamy dopiero, gdy odstaje o co najmniej 12 punktów" jest obietnicą, a nie
 * ozdobnikiem: dokładnie tę liczbę widać potem pod każdym typem. Gdy ktoś zmieni próg
 * w polityce typów i nie tknie tej strony, serwis zacznie kłamać o sobie — cicho,
 * bo nic się nie wywróci. Ten test jest jedyną rzeczą, która to zauważy.
 */

setupEnv();

const { methodContent } = await import('@/lib/landing/method');
const { MIN_LIFT } = await import('@/lib/picks/policy');

describe('opis metody zgadza się z polityką typów', () => {
	for (const locale of ['pl', 'en']) {
		test(`próg z polityki pojawia się w treści (${locale})`, () => {
			const linie = methodContent(locale).threshold.example.lines;
			const zProgiem = linie.filter((l) => l.includes(String(MIN_LIFT)));

			assert.equal(
				zProgiem.length,
				1,
				`dokładnie jedna linia przykładu ma podawać próg ${MIN_LIFT}; jest ich ${zProgiem.length}`
			);
		});
	}
});

describe('treść nie wraca do żargonu', () => {
	/*
	 * Pierwsza wersja strony była prawdziwa i niezrozumiała: mówiła o „normie rynku"
	 * i „przewadze nad normą", nie tłumacząc, przeciętną CZEGO ani o ile ma być więcej.
	 * Te słowa mają sens w kodzie i żadnego w tekście dla kibica.
	 */
	const ZAKAZANE = ['norma rynku', 'normy rynku', 'kalibracj', 'log loss', 'rozkład Poissona', 'bukmacherz'];

	/** Wszystkie napisy z drzewa treści, bez kluczy. */
	function teksty(wezel, out = []) {
		if (typeof wezel === 'string') out.push(wezel);
		else if (Array.isArray(wezel)) for (const w of wezel) teksty(w, out);
		else if (wezel && typeof wezel === 'object') for (const w of Object.values(wezel)) teksty(w, out);
		return out;
	}

	test('polska treść jest wolna od terminów, których nie tłumaczymy', () => {
		const wszystko = teksty(methodContent('pl')).join(' ').toLowerCase();
		for (const slowo of ZAKAZANE) {
			assert.equal(wszystko.includes(slowo), false, `w treści pojawiło się „${slowo}"`);
		}
	});

	test('każda sekcja ma komplet pól, których oczekuje strona', () => {
		for (const locale of ['pl', 'en']) {
			const c = methodContent(locale);
			for (const sekcja of ['summary', 'cta', 'details', 'steps', 'threshold', 'limits', 'proof', 'faq']) {
				assert.ok(c[sekcja], `${locale}: brak sekcji ${sekcja}`);
			}
			assert.equal(c.threshold.example.lines.length >= 3, true, `${locale}: przykład za krótki`);
			assert.ok(c.proof.cta && c.cta.register, `${locale}: brak odnośnika`);
		}
	});
});

describe('pytania na stronie „Jak to działa"', () => {
	/*
	 * 22.11.2026 strona główna zeszła do dziesięciu pytań, reszta przeszła tutaj. Każde pytanie
	 * stoi na jednej stronie — dwa FAQPage z tym samym pytaniem to dla wyszukiwarki duplikat.
	 */
	for (const locale of ['pl', 'en']) {
		test(`${locale}: komplet pól, bez powtórek ze strony głównej i bez kursów`, async () => {
			const { faqItems, methodFaqItems } = await import('@/lib/landing/faq');
			const pytania = methodFaqItems(locale);
			assert.ok(pytania.length > 0, 'brak pytań');
			for (const p of pytania) assert.ok(p.question && p.answer, 'pytanie bez odpowiedzi');
			const naGlownej = new Set(faqItems(locale).map((p) => p.question));
			for (const p of pytania) assert.ok(!naGlownej.has(p.question), `pytanie na obu stronach: ${p.question}`);
			const tekst = JSON.stringify(pytania).toLowerCase();
			for (const slowo of ['kurs', 'odds', 'stawk', 'obstaw', 'pewniak']) assert.ok(!tekst.includes(slowo), slowo);
		});
	}
});
