import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Stan widoku w adresie (`lib/urlState.js`): zakładka, okres, dzień listy i fraza przeżywają
 * „Wstecz", odświeżenie i wysłany link. Adres to dane z zewnątrz — ktoś mógł go przepisać albo
 * przysłać sprzed tygodnia — więc te testy pilnują przede wszystkim, że śmieci wracają do
 * wartości domyślnej, a ustawienie jednego parametru nie kasuje pozostałych.
 */

setupEnv();

const {
	isAllowedParam,
	readParam,
	mergeSearch,
	paramValue,
	isPageParam,
	isSearchParam,
	isObjectIdParam,
	MAX_SEARCH_PARAM,
	accuracyHref,
	prematchBackHref,
	PREMATCH_PATH,
	isReturnVisit,
	RETURN_WINDOW_MS,
	parseScrollY,
} = await import('@/lib/urlState');

describe('odczyt parametru z walidacją', () => {
	const KINDS = ['all', 'daily', 'coupon_3d'];

	test('znana wartość przechodzi', () => {
		assert.equal(readParam('coupon_3d', KINDS, 'all'), 'coupon_3d');
	});

	test('brak, pusty i nieznany parametr dają wartość domyślną', () => {
		assert.equal(readParam(null, KINDS, 'all'), 'all');
		assert.equal(readParam('', KINDS, 'all'), 'all');
		assert.equal(readParam('coupon_7d', KINDS, 'all'), 'all');
		// Wielkość liter ma znaczenie — adres z `COUPON_3D` to nie nasza wartość.
		assert.equal(readParam('COUPON_3D', KINDS, 'all'), 'all');
	});

	test('reguła może być funkcją', () => {
		assert.equal(readParam('3', isPageParam, '1'), '3');
		assert.equal(readParam('abc', isPageParam, '1'), '1');
	});

	test('bez reguły nic nie przechodzi', () => {
		assert.equal(isAllowedParam('cokolwiek', undefined), false);
	});
});

describe('składanie adresu', () => {
	test('ustawienie jednego parametru zostawia pozostałe', () => {
		assert.equal(mergeSearch('?date=2026-10-25&q=legia', { page: '2' }), '?date=2026-10-25&q=legia&page=2');
		assert.equal(mergeSearch('?kind=coupon_3d&days=30', { kind: 'value' }), '?kind=value&days=30');
	});

	test('null i pusty napis usuwają parametr, a pusty wynik to brak `?`', () => {
		assert.equal(mergeSearch('?kind=coupon_3d&days=30', { days: null }), '?kind=coupon_3d');
		assert.equal(mergeSearch('?q=legia', { q: '' }), '');
		assert.equal(mergeSearch('', { page: undefined }), '');
	});

	test('kilka zmian naraz: nowy dzień zeruje stronę, fraza zostaje', () => {
		assert.equal(mergeSearch('?date=2026-10-25&q=lech&page=3', { date: '2026-10-26', page: null }), '?date=2026-10-26&q=lech');
	});

	test('polskie znaki i spacje są kodowane', () => {
		const search = mergeSearch('', { q: 'Śląsk Wrocław' });
		assert.equal(new URLSearchParams(search).get('q'), 'Śląsk Wrocław');
		assert.match(search, /^\?q=[\w.*%+=&-]+$/);
	});

	test('wartość domyślna nie trafia do adresu', () => {
		assert.equal(paramValue('all', 'all'), null);
		assert.equal(paramValue('coupon_5d', 'all'), 'coupon_5d');
	});
});

describe('walidatory', () => {
	test('numer strony: dodatnia liczba całkowita bez zer wiodących', () => {
		for (const ok of ['1', '2', '42', '9999']) assert.equal(isPageParam(ok), true, ok);
		for (const zle of ['0', '01', '-1', '1.5', '10000', '2e3', ' 2']) assert.equal(isPageParam(zle), false, zle);
	});

	test('fraza: niepusta po przycięciu i rozsądnej długości', () => {
		assert.equal(isSearchParam('legia'), true);
		assert.equal(isSearchParam('   '), false);
		assert.equal(isSearchParam('x'.repeat(MAX_SEARCH_PARAM)), true);
		assert.equal(isSearchParam('x'.repeat(MAX_SEARCH_PARAM + 1)), false);
	});

	test('identyfikator raportu: 24 znaki szesnastkowe', () => {
		assert.equal(isObjectIdParam('65f1a2b3c4d5e6f7a8b9c0d1'), true);
		assert.equal(isObjectIdParam('65f1a2b3c4d5e6f7a8b9c0d'), false);
		assert.equal(isObjectIdParam('../../api/admin'), false);
	});
});

describe('odnośniki prosto do widoku', () => {
	test('skuteczność na zakładce kuponu i całym okresie', () => {
		assert.equal(accuracyHref({ kind: 'coupon_3d', days: 'all' }), '/pilka-nozna/skutecznosc?kind=coupon_3d&days=all');
	});

	test('wartości domyślne dają czysty adres', () => {
		assert.equal(accuracyHref(), '/pilka-nozna/skutecznosc');
		assert.equal(accuracyHref({ kind: 'all', days: '90' }), '/pilka-nozna/skutecznosc');
		assert.equal(accuracyHref({ kind: 'value' }), '/pilka-nozna/skutecznosc?kind=value');
	});

	test('powrót na listę meczów z zapamiętanym dniem i frazą', () => {
		assert.equal(prematchBackHref('?date=2026-10-25&q=legia'), `${PREMATCH_PATH}?date=2026-10-25&q=legia`);
		assert.equal(prematchBackHref(mergeSearch('', { q: 'Śląsk Wrocław' })), `${PREMATCH_PATH}?q=%C5%9Al%C4%85sk+Wroc%C5%82aw`);
	});

	test('pusty albo podejrzany zapis prowadzi na czystą listę', () => {
		for (const zle of [null, '', '?', 'date=2026-10-25', '?a=<script>', '?x=" onmouseover=', `?q=${'x'.repeat(400)}`, '?#hash']) {
			assert.equal(prematchBackHref(zle), PREMATCH_PATH, String(zle));
		}
	});
});

describe('powrót, po którym przywracamy przewinięcie', () => {
	const HREF = 'https://czatsportowy.pl/pl/pilka-nozna/przedmeczowe?date=2026-10-25';
	const NOW = 1_800_000_000_000;

	test('„Wstecz" w aplikacji na ten sam adres — tak', () => {
		assert.equal(isReturnVisit({ href: HREF, now: NOW, lastPop: { href: HREF, at: NOW - 300 } }), true);
	});

	test('„Wstecz" na inny adres albo dawno temu — nie', () => {
		assert.equal(isReturnVisit({ href: HREF, now: NOW, lastPop: { href: `${HREF}&page=2`, at: NOW - 300 } }), false);
		assert.equal(isReturnVisit({ href: HREF, now: NOW, lastPop: { href: HREF, at: NOW - RETURN_WINDOW_MS } }), false);
	});

	test('zwykłe wejście z menu — nie', () => {
		assert.equal(isReturnVisit({ href: HREF, now: NOW }), false);
		assert.equal(isReturnVisit({ href: HREF, now: NOW, firstMount: true, navigation: { type: 'navigate', name: HREF } }), false);
	});

	test('odświeżenie i powrót z innej witryny — tylko przy pierwszym montowaniu i na tym samym adresie', () => {
		assert.equal(isReturnVisit({ href: HREF, now: NOW, firstMount: true, navigation: { type: 'reload', name: HREF } }), true);
		assert.equal(isReturnVisit({ href: HREF, now: NOW, firstMount: true, navigation: { type: 'back_forward', name: HREF } }), true);
		// Odświeżona była INNA strona, a tu weszło się z menu.
		assert.equal(
			isReturnVisit({ href: HREF, now: NOW, firstMount: true, navigation: { type: 'reload', name: 'https://czatsportowy.pl/pl' } }),
			false
		);
		// Druga wizyta na tym samym adresie w tym samym dokumencie to już nawigacja w aplikacji.
		assert.equal(isReturnVisit({ href: HREF, now: NOW, firstMount: false, navigation: { type: 'reload', name: HREF } }), false);
	});

	test('zapisana pozycja: tylko dodatnia liczba całkowita', () => {
		assert.equal(parseScrollY('1240'), 1240);
		for (const zle of [null, '', '0', '-5', '12.5', 'abc', '99999999']) assert.equal(parseScrollY(zle), null, String(zle));
	});
});
