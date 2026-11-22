import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Rejestr typów — część czysta: kto wchodzi, który kurs jest bazowy, CLV, sumy i werdykt.
 *
 * Najważniejsze reguły to te, które chronią przed podkręcaniem: typ po starcie meczu nie wchodzi,
 * kurs bazowy nie może być sprzed publikacji (inaczej przypisalibyśmy sobie ruch rynku, którego
 * nikt nie mógł wykorzystać), zamknięcie musi być później niż kurs bazowy, a typ przed meczem
 * nie zdradza selekcji. Do tego teksty: bez obietnic zysku i bez zachęt do gry, na stronie
 * głównej także bez słowa o kursach.
 */

setupEnv();

const {
	buildRow,
	clvOf,
	clvVerdict,
	closingOdds,
	filterRows,
	leagueOptions,
	oddsKey,
	publicRow,
	publishedBeforeKickoff,
	referenceOdds,
	registerView,
	summarizeRows,
	MIN_CLV_SAMPLE,
	REGISTER_PAGE_SIZE,
} = await import('@/lib/trust/register');
const { PL_TAX } = await import('@/lib/model/oddsShadow');
const { formatSignedPct, formatOdds, formatShare, leadMessage, selectionMessage, formatDateTime } = await import('@/lib/trust/format');
const { registerHref, isLeagueParam } = await import('@/lib/trust/params');
const { tasksFor } = await import('@/lib/trust/oddsJob');
const { landingContent } = await import('@/lib/landing/content');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wiadomosci = (locale) => JSON.parse(readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'));

const KICK = new Date('2099-05-10T18:00:00Z');
const godz = (h) => new Date(KICK.getTime() + h * 3600_000);
const blisko = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Typ w kształcie `Pick` (lean). */
const typ = (over = {}) => ({
	_id: over._id ?? `id-${Math.random().toString(16).slice(2)}`,
	fixtureId: '1',
	kind: 'hint',
	createdAt: godz(-30),
	kickoff: KICK,
	normalized: { type: 'doubleChance', value: '1X' },
	probability: 78,
	status: 'won',
	finalScore: { home: 1, away: 1 },
	homeName: 'Legia',
	awayName: 'Lech',
	leagueName: 'Ekstraklasa',
	leagueId: 106,
	...over,
});

describe('kto wchodzi do rejestru', () => {
	test('tylko typ zapisany przed pierwszym gwizdkiem', () => {
		assert.equal(publishedBeforeKickoff({ createdAt: godz(-1), kickoff: KICK }), true);
		assert.equal(publishedBeforeKickoff({ createdAt: KICK, kickoff: KICK }), false, 'równo z gwizdkiem to już po starcie');
		assert.equal(publishedBeforeKickoff({ createdAt: godz(0.5), kickoff: KICK }), false);
		assert.equal(publishedBeforeKickoff({ createdAt: godz(-1), kickoff: null }), false, 'bez godziny meczu nie da się udowodnić');
		assert.equal(publishedBeforeKickoff({ createdAt: null, kickoff: KICK }), false);
	});

	test('selekcje z kursem w zdjęciu — reszta bez kursu, nie zgadywana', () => {
		assert.equal(oddsKey({ type: 'matchWinner', value: 'home' }), 'home');
		assert.equal(oddsKey({ type: 'matchWinner', value: 'draw' }), 'draw');
		assert.equal(oddsKey({ type: 'doubleChance', value: '1X' }), 'dc1X');
		assert.equal(oddsKey({ type: 'doubleChance', value: 'X2' }), 'dcX2');
		assert.equal(oddsKey({ type: 'doubleChance', value: '12' }), null);
		assert.equal(oddsKey({ type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 }), 'awayScores');
		assert.equal(oddsKey({ type: 'teamGoals', side: 'away', dir: 'over', line: 1.5 }), null);
		assert.equal(oddsKey({ type: 'totalGoals', dir: 'over', line: 2.5 }), 'over25');
		assert.equal(oddsKey({ type: 'totalGoals', dir: 'under', line: 2.5 }), null);
		assert.equal(oddsKey({ type: 'btts', value: 'yes' }), null);
		assert.equal(oddsKey(null), null);
	});
});

describe('kurs bazowy, zamknięcie i CLV', () => {
	const rano = { at: godz(-9), dc1X: 1.5 };
	const poludnie = { at: godz(-5), dc1X: 1.45 };

	test('CLV = kurs bazowy / zamknięcie − 1', () => {
		blisko(clvOf(1.5, 1.4), 1.5 / 1.4 - 1);
		assert.equal(clvOf(1.5, 1.5), 0);
		assert.ok(clvOf(1.4, 1.5) < 0);
		assert.equal(clvOf(null, 1.5), null);
		assert.equal(clvOf(1.5, 1), null, 'kurs 1,00 to brak kursu');
	});

	test('pierwsze zdjęcie PO publikacji — nigdy sprzed niej i nigdy najkorzystniejsze', () => {
		// Publikacja przed porankiem: bierzemy poranek.
		assert.deepEqual(referenceOdds({ publishedAt: godz(-30), kickoff: KICK, selection: 'dc1X', snapshots: [poludnie, rano] }), {
			odds: 1.5,
			at: rano.at,
		});
		// Publikacja po porannym zdjęciu: poranek odpada, zostaje zdjęcie z południa.
		assert.equal(referenceOdds({ publishedAt: godz(-7), kickoff: KICK, selection: 'dc1X', snapshots: [rano, poludnie] }).odds, 1.45);
		// Po publikacji nie ma zdjęcia — brak kursu, nie poranny „na zapas".
		assert.equal(referenceOdds({ publishedAt: godz(-2), kickoff: KICK, selection: 'dc1X', snapshots: [rano, poludnie] }), null);
		// Zdjęcie po gwizdku się nie liczy; selekcja bez kursu w zdjęciu też nie.
		assert.equal(referenceOdds({ publishedAt: godz(-2), kickoff: KICK, selection: 'dc1X', snapshots: [{ at: godz(1), dc1X: 2 }] }), null);
		assert.equal(referenceOdds({ publishedAt: godz(-30), kickoff: KICK, selection: 'home', snapshots: [rano] }), null);
	});

	test('zamknięcie: pierwsze zdjęcie z kursem, nie po meczu', () => {
		const puste = { at: godz(-0.3), bookmakers: 0 };
		assert.equal(closingOdds({ kickoff: KICK, selection: 'dc1X', snapshots: [puste, { at: godz(-0.25), dc1X: 1.4 }] }).odds, 1.4);
		assert.equal(closingOdds({ kickoff: KICK, selection: 'dc1X', snapshots: [{ at: godz(0.5), dc1X: 1.4 }] }), null);
	});

	test('wiersz: poranny kurs z dziennika, zamknięcie, CLV i źródło kursu', () => {
		const forecast = { odds: { open: rano, close: { at: godz(-0.3), dc1X: 1.4 } }, leagueCountry: 'Poland' };
		const r = buildRow(typ(), { forecast }, godz(3));
		assert.equal(r.refOdds, 1.5);
		assert.equal(r.refSource, 'morning');
		assert.equal(r.closeOdds, 1.4);
		blisko(r.clv, 1.5 / 1.4 - 1);
		assert.equal(r.started, true);
		assert.equal(r.country, 'Poland');
		assert.equal(r.leadMinutes, 30 * 60);
	});

	test('typ po porannym zdjęciu liczy się od zdjęcia przy publikacji (zapas rejestru)', () => {
		const forecast = { odds: { open: rano, close: { at: godz(-0.3), dc1X: 1.4 } } };
		const extra = { after: [{ at: godz(-4.9), dc1X: 1.42 }] };
		const r = buildRow(typ({ createdAt: godz(-5) }), { forecast, extra }, godz(3));
		assert.equal(r.refOdds, 1.42);
		assert.equal(r.refSource, 'publish');
		blisko(r.clv, 1.42 / 1.4 - 1);
	});

	test('mecz spoza dziennika: poranek i zamknięcie z zapasu rejestru', () => {
		const extra = { open: { at: godz(-9), home: 2.1 }, close: { at: godz(-0.2), home: 1.9 } };
		const r = buildRow(typ({ normalized: { type: 'matchWinner', value: 'home' } }), { forecast: null, extra }, godz(3));
		assert.equal(r.refOdds, 2.1);
		assert.equal(r.closeOdds, 1.9);
		assert.ok(r.clv > 0);
	});

	test('zamknięcie wcześniejsze niż kurs bazowy — bez CLV', () => {
		const extra = { after: [{ at: godz(-0.1), dc1X: 1.4 }] };
		const forecast = { odds: { open: rano, close: { at: godz(-0.3), dc1X: 1.35 } } };
		const r = buildRow(typ({ createdAt: godz(-0.15) }), { forecast, extra }, godz(3));
		assert.equal(r.refOdds, 1.4);
		assert.equal(r.clv, null);
	});

	test('typ przed meczem jest zamknięty: mecz i godzina zapisu tak, selekcja i kurs nie', () => {
		const forecast = { odds: { open: rano } };
		const r = publicRow(buildRow(typ({ status: 'pending' }), { forecast }, godz(-3)));
		assert.equal(r.locked, true);
		assert.ok(r.publishedAt && r.kickoff && r.homeName);
		for (const pole of ['normalized', 'market', 'probability', 'refOdds', 'closeOdds', 'clv', 'status']) {
			assert.equal(r[pole], undefined, `${pole} nie może wyjść przed meczem`);
		}
	});
});

describe('sumy i werdykt', () => {
	const wiersz = (status, ref, close, extra = {}) => ({
		started: true,
		status,
		refOdds: ref,
		closeOdds: close,
		clv: clvOf(ref, close),
		kickoff: KICK,
		publishedAt: godz(-10),
		market: 'doubleChance',
		leagueId: 1,
		...extra,
	});

	test('trafienia, zwrot przy kursie bazowym (i po podatku) oraz CLV', () => {
		const rows = [
			wiersz('won', 2.0, 1.8),
			wiersz('lost', 2.0, 2.2),
			wiersz('won', 1.5, 1.5),
			wiersz('won', null, null), // bez kursu: trafienie tak, zwrot i CLV nie
			wiersz('pending', 1.6, 1.5), // CLV jest już w chwili gwizdka
			{ ...wiersz('pending', 1.6, 1.5), started: false }, // przed meczem — poza sumami
		];
		const s = summarizeRows(rows);
		assert.equal(s.total, 5);
		assert.equal(s.settled, 4);
		assert.equal(s.won, 3);
		assert.equal(s.pending, 1);
		assert.equal(s.hitRate, 0.75);
		assert.equal(s.withOdds, 3);
		blisko(s.roi, (1 + -1 + 0.5) / 3, 1e-4);
		blisko(s.roiTaxed, (2 * (1 - PL_TAX) - 1 + -1 + 1.5 * (1 - PL_TAX) - 1) / 3, 1e-4);
		assert.equal(s.clv.n, 4);
		blisko(s.clv.mean, (2 / 1.8 - 1 + 2 / 2.2 - 1 + 0 + 1.6 / 1.5 - 1) / 4, 1e-5);
		assert.equal(s.clv.beat, 0.5);
		assert.equal(s.clv.same, 0.25);
		assert.equal(s.clv.worse, 0.25);
		assert.equal(s.coverage, 0.8);
		assert.equal(s.clv.verdict, 'too_few');
	});

	test('werdykt z przedziału, nie z samej średniej', () => {
		const n = MIN_CLV_SAMPLE;
		assert.equal(clvVerdict({ n: n - 1, mean: 0.2, low: 0.1, high: 0.3 }), 'too_few');
		assert.equal(clvVerdict({ n, mean: -0.02, low: -0.03, high: -0.01 }), 'behind');
		assert.equal(clvVerdict({ n, mean: 0.003, low: -0.001, high: 0.007 }), 'level');
		// Pomiar z 21.11.2026: +0,26% przy przedziale 0,1–0,4% — powyżej zera, ale to nie zysk.
		assert.equal(clvVerdict({ n, mean: 0.0026, low: 0.001, high: 0.0042 }), 'small');
		assert.equal(clvVerdict({ n, mean: 0.06, low: 0.04, high: 0.08 }), 'ahead');
	});

	test('filtry okresu, rynku i ligi; przekroje; stronicowanie', () => {
		const now = new Date('2099-06-01T12:00:00Z');
		const dzien = (d) => new Date(now.getTime() - d * 86_400_000);
		const rows = [];
		for (let i = 0; i < 60; i += 1) {
			rows.push(
				wiersz(i % 3 ? 'won' : 'lost', 1.5, 1.45, {
					id: `r${i}`,
					kickoff: dzien(i), // 0–59 dni temu
					market: i % 2 ? 'matchWinner' : 'doubleChance',
					leagueId: i % 4 ? 39 : 106,
					leagueName: i % 4 ? 'Premier League' : 'Ekstraklasa',
					country: i % 4 ? 'England' : null,
					normalized: { type: i % 2 ? 'matchWinner' : 'doubleChance', value: i % 2 ? 'home' : '1X' },
				})
			);
		}
		assert.equal(filterRows(rows, { period: '7' }, now).length, 8); // 0..7 dni
		assert.equal(filterRows(rows, { period: 'all', market: 'matchWinner' }, now).length, 30);
		assert.equal(filterRows(rows, { period: 'all', league: '106' }, now).length, 15);

		const v = registerView(rows, { period: '30', market: 'all', league: 'all', page: 99 }, now);
		assert.equal(v.total, 31);
		assert.equal(v.pages, Math.ceil(31 / REGISTER_PAGE_SIZE));
		assert.equal(v.page, v.pages, 'strona poza zakresem wraca do ostatniej');
		assert.equal(v.items.length, 31 - REGISTER_PAGE_SIZE);
		assert.deepEqual(v.periods.map((p) => p.key), ['7', '30', '90', 'all']);
		assert.equal(v.periods.find((p) => p.key === 'all').total, 60);
		assert.deepEqual(v.byMarket.map((m) => m.key).sort(), ['doubleChance', 'matchWinner']);
		assert.equal(v.byLeague[0].key, '39');
		assert.equal(v.byLeague[0].country, 'England');
		// Najnowsze pierwsze.
		const pierwsza = registerView(rows, { period: 'all' }, now).items;
		assert.equal(pierwsza[0].id, 'r0');

		const ligi = leagueOptions(rows);
		assert.equal(ligi[0].key, '39');
		assert.equal(ligi[0].n, 45);
	});
});

describe('zdjęcia kursów rejestru — co zdjąć w przebiegu', () => {
	const NOW = new Date('2099-03-10T08:10:00Z'); // 9:10 w Warszawie
	const za = (min) => new Date(NOW.getTime() + min * 60_000);
	const mecz = (kickoff, publishedAt) => ({ fixtureId: 'x', kickoff, publishedAt });

	test('mecz bez dziennika: zamknięcie w oknie 30 minut, poranek w oknie porannym', () => {
		assert.deepEqual(tasksFor(mecz(za(20), [za(-600)]), { now: NOW }), ['close']);
		assert.deepEqual(tasksFor(mecz(za(180), [za(-600)]), { now: NOW }), ['open']);
		assert.deepEqual(tasksFor(mecz(za(180), [za(-600)]), { now: NOW, extra: { open: { at: za(-5) } } }), []);
		assert.deepEqual(tasksFor(mecz(za(20), [za(-600)]), { now: NOW, extra: { close: { at: za(-1) } } }), []);
	});

	test('typ po porannym zdjęciu dostaje zdjęcie przy publikacji — raz', () => {
		const forecast = { odds: { open: { at: za(-60) } } };
		assert.deepEqual(tasksFor(mecz(za(300), [za(-10)]), { now: NOW, forecast }), ['after']);
		assert.deepEqual(tasksFor(mecz(za(300), [za(-120)]), { now: NOW, forecast }), [], 'typ sprzed poranka ma poranek');
		assert.deepEqual(tasksFor(mecz(za(300), [za(-10)]), { now: NOW, forecast, extra: { after: [{ at: za(-5) }] } }), []);
	});

	test('dziennik bez poranka jeszcze — poranek przyjdzie sam; mecz za blisko na poranek — zdjęcie teraz', () => {
		assert.deepEqual(tasksFor(mecz(za(240), [za(-10)]), { now: NOW, forecast: { odds: {} } }), []);
		assert.deepEqual(tasksFor(mecz(za(45), [za(-10)]), { now: NOW }), ['after']);
		// W ostatnich 30 minutach nie ma po co: kurs z publikacji byłby kursem zamknięcia.
		assert.deepEqual(tasksFor(mecz(za(20), [za(-5)]), { now: NOW, forecast: { odds: { open: { at: za(-60) } } } }), []);
		assert.deepEqual(tasksFor(mecz(za(-5), [za(-60)]), { now: NOW }), [], 'mecz już trwa');
	});
});

describe('formatowanie i adres', () => {
	test('procent ze znakiem, kurs, udział', () => {
		assert.equal(formatSignedPct(0.0263, 'pl'), '+2,6%');
		assert.equal(formatSignedPct(-0.0263, 'en'), '−2.6%');
		assert.equal(formatSignedPct(0.00001, 'pl'), '0,0%', 'zero bez znaku plus');
		assert.equal(formatSignedPct(null, 'pl'), null);
		assert.equal(formatOdds(1.395, 'pl'), '1,40');
		assert.equal(formatShare(0.3988, 'en'), '40%');
		assert.equal(formatDateTime('2099-03-10T08:10:00Z', 'pl'), '10.03, 09:10');
	});

	test('wyprzedzenie publikacji i selekcja z postaci znormalizowanej', () => {
		assert.deepEqual(leadMessage(2196), { key: 'lead_days', values: { d: 1, h: 12 } }); // 36 h 36 min
		assert.deepEqual(leadMessage(125), { key: 'lead_hours', values: { h: 2, m: 5 } });
		assert.deepEqual(leadMessage(9), { key: 'lead_minutes', values: { m: 9 } });
		assert.deepEqual(selectionMessage({ type: 'doubleChance', value: 'X2' }, { homeName: 'Legia', awayName: 'Lech' }), {
			key: 'sel_X2',
			values: { team: 'Lech' },
		});
		assert.deepEqual(selectionMessage({ type: 'totalGoals', dir: 'over', line: 2.5 }, { locale: 'pl' }), {
			key: 'sel_total_over',
			values: { line: '2,5' },
		});
		assert.equal(selectionMessage({ type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 }, {}).key, 'sel_team_scores');
	});

	test('adres rejestru bez wartości domyślnych; liga tylko jako liczba', () => {
		assert.equal(registerHref(), '/pilka-nozna/skutecznosc?view=register');
		assert.equal(registerHref({ period: 'all', league: 39 }), '/pilka-nozna/skutecznosc?view=register&period=all&league=39');
		assert.equal(isLeagueParam('39'), true);
		assert.equal(isLeagueParam('all'), true);
		assert.equal(isLeagueParam('39; drop'), false);
		assert.equal(isLeagueParam('0'), false);
	});
});

describe('teksty: bez obietnic zysku i zachęt do gry', () => {
	const ZACHETY = ['wygrywaj', 'zarabiaj', 'zarob', 'pewniak', 'pewna wygrana', 'gwarant', 'sure thing', 'guarantee', 'win big', 'earn money', 'place a bet', 'obstaw', 'stawiaj'];
	// Na stronie głównej (treść sekcji, etykiety wysepki, werdykty) — także bez słownika zakładów.
	const ZAKLADY_GLOWNA = ['kurs', 'odds', 'bukmacher', 'bookmaker', 'stawk', 'stake'];

	for (const locale of ['pl', 'en']) {
		const trust = wiadomosci(locale).trust;

		test(`${locale}: przestrzeń „trust" kompletna w obu językach i bez zachęt`, () => {
			assert.deepEqual(Object.keys(trust).sort(), Object.keys(wiadomosci(locale === 'pl' ? 'en' : 'pl').trust).sort());
			const tekst = JSON.stringify(trust).toLowerCase();
			for (const slowo of ZACHETY) assert.ok(!tekst.includes(slowo), slowo);
			assert.ok(trust.disclaimer.includes('18+'), 'brak 18+ w rejestrze');
		});

		test(`${locale}: sekcja rejestru na stronie głównej bez słownika zakładów, z 18+`, () => {
			const glowna = [
				landingContent(locale).register,
				...Object.entries(trust)
					.filter(([k]) => k.startsWith('landing_') || k.startsWith('verdict_') || k.startsWith('status_') || k.startsWith('sel_') || k.startsWith('lead'))
					.map(([, v]) => v),
			];
			const tekst = JSON.stringify(glowna).toLowerCase();
			for (const slowo of [...ZACHETY, ...ZAKLADY_GLOWNA]) assert.ok(!tekst.includes(slowo), slowo);
			assert.ok(trust.landing_note.includes('18+'), 'brak 18+ przy liczbach na stronie głównej');
		});

		test(`${locale}: hasło o analizie w 30 sekund stoi nad rejestrem, nagłówek ma odnośnik do rejestru`, () => {
			// 22.11.2026: nagłówek wrócił do poprzedniego tytułu, hasło przeszło do sekcji rejestru.
			const c = landingContent(locale);
			assert.match(c.register.title, /30/);
			assert.ok(c.hero.registerCta, 'brak odnośnika do rejestru w nagłówku');
		});
	}
});
