import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Regulamin i polityka prywatności opisują serwis taki, jaki jest w kodzie.
 *
 * Do 24.10.2026 regulamin znał tylko analizy, raporty i asystenta jednego meczu — bez kuponów,
 * kuponu live, porannego maila, okresu próbnego i asystenta całej oferty — a o planie mówił
 * „abonament", choć to jednorazowy dostęp na 30 dni. Polityka nie wspominała, że rozmowy
 * z asystentem zapisują się na koncie. Te testy wiążą najważniejsze zdania z definicjami w kodzie:
 * zmiana okresu próbnego, kosztu w kredytach czy sufitu rozmów wywróci test, zanim dokument
 * zacznie mówić nieprawdę.
 */

setupEnv();

const { TERMS, PRIVACY, documentFor } = await import('@/lib/legal/documents');
const { CREDIT_COSTS, PLAN_PASS_DAYS, PLANS, QUOTA_PERIODS, TRIAL } = await import('@/lib/billing/plans');
const { MAX_PER_USER } = await import('@/models/AssistantConversation');
const { TERMS_VERSION, UPDATED_AT } = await import('@/lib/legal/operator');
const { CONSENT_VERSION } = await import('@/lib/legal/purchaseConsent');

/** Cała treść dokumentu jako jeden napis — nagłówki, akapity, punkty i komórki tabel. */
const tekst = (wezel) =>
	typeof wezel === 'string' ? wezel : Array.isArray(wezel) || (wezel && typeof wezel === 'object')
		? Object.values(wezel).map(tekst).join('\n')
		: '';

const FUNKCJE = {
	pl: ['kupon dnia', 'kupony 3- i 5-dniowy', 'kupon live', '„Wyższe kursy"', 'zakładce Asystent', 'historią rozmów', 'wyszukuje w internecie', 'poranny mail', 'typ dnia', 'w trakcie gry', 'okres próbny', 'kreator kuponu', 'nie wchodzą do publicznej skuteczności'],
	en: ['coupon of the day', '3-day and 5-day coupons', 'live coupon', '“Higher odds”', 'Assistant tab', 'conversation history', 'searches the web', 'morning email', 'pick of the day', 'in play', 'trial', 'coupon builder', 'never count towards the site’s public accuracy'],
};

describe('regulamin', () => {
	for (const locale of ['pl', 'en']) {
		const t = tekst(documentFor(TERMS, locale));
		const ma = (fragment) => assert.ok(t.includes(fragment), `${locale}: brak „${fragment}"`);

		test(`${locale}: wymienia funkcje, które serwis ma`, () => {
			for (const f of FUNKCJE[locale]) ma(f);
		});

		test(`${locale}: plan to dostęp na ${PLAN_PASS_DAYS} dni, nie abonament`, () => {
			assert.ok(!/abonament|subskrypc|subscription/i.test(t), 'plan nie odnawia się sam — to nie abonament');
			ma(locale === 'en' ? `${PLAN_PASS_DAYS} days from purchase` : `${PLAN_PASS_DAYS} dni od zakupu`);
			ma(locale === 'en' ? 'nothing renews automatically' : 'nic nie odnawia się automatycznie');
		});

		test(`${locale}: liczby z planów — okres próbny i koszt w kredytach`, () => {
			ma(locale === 'en' ? `first ${TRIAL.days} days` : `pierwsze ${TRIAL.days} dni`);
			if (locale === 'pl') {
				ma(`analiza kosztuje ${CREDIT_COSTS.analysis} kredyt`);
				ma(`raport ${CREDIT_COSTS.report} kredyty`);
			} else {
				ma(`an analysis costs ${CREDIT_COSTS.analysis} credit`);
				ma(`a report ${CREDIT_COSTS.report}`);
			}
			// Kredyty działają tylko tam, gdzie mają cenę — pytania i wyszukiwania nie.
			assert.equal(CREDIT_COSTS.aiChat, undefined);
			assert.equal(CREDIT_COSTS.aiNews, undefined);
			ma(locale === 'en' ? 'news searches never consume credits' : 'wyszukiwania wiadomości nie zużywają kredytów');
		});

		test(`${locale}: okres próbny — co obejmuje, a czego nie, zgodnie z TRIAL`, () => {
			assert.ok(TRIAL.features.includes('model_hints'), 'kupony 3-/5-dniowe i live idą za model_hints');
			assert.ok(TRIAL.features.includes('morning_email'));
			assert.ok(!TRIAL.features.includes('live_analysis'), 'regulamin mówi, że próba nie obejmuje analiz w trakcie gry');
			assert.equal((TRIAL.limits.aiNews ?? 0) + PLANS.free.limits.aiNews, 0, 'regulamin mówi, że próba nie obejmuje wyszukiwania');
			ma(
				locale === 'en'
					? 'The trial does not include in-play analyses or web news search'
					: 'Okres próbny nie obejmuje analiz meczów w trakcie gry ani wyszukiwania wiadomości'
			);
		});

		test(`${locale}: dzienne limity — czytanie analiz i kreator kuponu (QUOTA_PERIODS)`, () => {
			assert.equal(QUOTA_PERIODS.couponGen, 'day');
			assert.equal(QUOTA_PERIODS.analysisView, 'day');
			ma(locale === 'en' ? 'existing analyses and the coupon builder limit are daily' : 'gotowych analiz w planie bezpłatnym i limit kreatora kuponu');
		});

		test(`${locale}: zastrzeżenia — bez zakładów, kursy to mediana bez odnośników, 18+`, () => {
			ma(locale === 'en' ? 'do not accept stakes' : 'nie przyjmuje stawek');
			ma(locale === 'en' ? 'median of several bookmakers' : 'mediana kursów kilku bukmacherów');
			ma(locale === 'en' ? 'without links to them' : 'bez odnośników do nich');
			ma(locale === 'en' ? 'adults only' : 'osób pełnoletnich');
			ma('801 889 880');
		});
	}
});

describe('polityka prywatności', () => {
	for (const locale of ['pl', 'en']) {
		const t = tekst(documentFor(PRIVACY, locale));
		const ma = (fragment) => assert.ok(t.includes(fragment), `${locale}: brak „${fragment}"`);

		test(`${locale}: rozmowy z asystentem — zapis, sufit z modelu, usuwanie`, () => {
			ma(locale === 'en' ? `at most ${MAX_PER_USER} conversations` : `najwyżej ${MAX_PER_USER} rozmów`);
			ma(locale === 'en' ? 'delete any of them yourself' : 'usunąć sam');
			ma(locale === 'en' ? '30 days after the last question' : '30 dni po ostatnim pytaniu');
		});

		test(`${locale}: dostawcy modeli, wyszukiwanie i poranny mail`, () => {
			ma('Anthropic PBC');
			ma('OpenAI, L.L.C.');
			ma(locale === 'en' ? 'Web news search' : 'Wyszukiwanie wiadomości w internecie');
			ma(locale === 'en' ? 'The morning email, if you switch it on' : 'Poranny mail, jeśli go włączysz');
			ma('token');
		});
	}
});

describe('data i wersja dokumentów', () => {
	test('data zmiany i wersja regulaminu to daty ISO, oświadczenie przy zakupie idzie za regulaminem', () => {
		for (const d of [UPDATED_AT, TERMS_VERSION]) {
			assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
			assert.ok(!Number.isNaN(new Date(d).getTime()), d);
		}
		assert.ok(TERMS_VERSION <= UPDATED_AT, 'wersja regulaminu nie może być nowsza niż data ostatniej zmiany');
		assert.equal(CONSENT_VERSION, TERMS_VERSION);
	});
});

/*
 * Przepustka Pro na 7 dni (od 22.11.2026): regulamin, „Zwroty", polityka i oświadczenie mówią
 * to samo co `PRO_WEEK` i `planAfterPurchase` — długość, dokupienie bez utraty dni, zwrot.
 */
const { REFUNDS } = await import('@/lib/legal/documents');
const { PRO_WEEK } = await import('@/lib/billing/plans');
const { consentFor } = await import('@/lib/legal/purchaseConsent');

describe('przepustka 7 dni w dokumentach', () => {
	for (const locale of ['pl', 'en']) {
		const regulamin = tekst(documentFor(TERMS, locale));
		const zwroty = tekst(documentFor(REFUNDS, locale));
		const polityka = tekst(documentFor(PRIVACY, locale));
		const ma = (t, fragment, gdzie) => assert.ok(t.includes(fragment), `${locale} ${gdzie}: brak „${fragment}"`);

		test(`${locale}: regulamin — długość, limity co 7 dni, dokupienie bez utraty dni`, () => {
			ma(regulamin, locale === 'en' ? `${PRO_WEEK.days}-day pass` : `przepustkę na ${PRO_WEEK.days} dni`, 'regulamin');
			ma(regulamin, locale === 'en' ? `passes: every ${PRO_WEEK.days} days` : `przepustki — co ${PRO_WEEK.days} dni`, 'regulamin');
			ma(regulamin, locale === 'en' ? 'remaining pass days are added at the end' : 'pozostałe dni przepustki doliczamy na końcu', 'regulamin');
			ma(regulamin, locale === 'en' ? 'A pass cannot be bought during a 30-day plan' : 'Przepustki nie można kupić w trakcie planu na 30 dni', 'regulamin');
		});

		test(`${locale}: „Zwroty" — przepustka jest towarem i zwrot proporcjonalny dotyczy też jej`, () => {
			ma(zwroty, locale === 'en' ? `${PRO_WEEK.days}-day Pro pass` : `przepustkę Pro na`, 'zwroty');
			ma(zwroty, locale === 'en' ? `the ${PRO_WEEK.days}-day pass included` : `także przepustki na ${PRO_WEEK.days} dni`, 'zwroty');
			ma(zwroty, `${PRO_WEEK.days} ${locale === 'en' ? 'or' : 'albo'} ${PLAN_PASS_DAYS}`, 'zwroty');
		});

		test(`${locale}: polityka — liczniki propozycji zakupu bez danych osobowych, wpisy pamięci lokalnej`, () => {
			ma(polityka, locale === 'en' ? 'Purchase-offer counters' : 'Liczniki propozycji zakupu', 'polityka');
			ma(polityka, locale === 'en' ? 'no account, IP address, device or time of day' : 'bez konta, adresu IP, urządzenia i godziny', 'polityka');
			ma(polityka, 'upsell:closed:*', 'polityka');
			ma(polityka, 'billing2:pending', 'polityka');
		});

		test(`${locale}: oświadczenie przy zakupie wspomina zwrot za niewykorzystane dni planu`, () => {
			assert.match(consentFor(locale).footnote, locale === 'en' ? /unused days/ : /niewykorzystane dni/);
		});
	}

	test('regulamin podbity razem ze zmianą planów — oświadczenie idzie za nim', () => {
		assert.ok(TERMS_VERSION >= '2026-11-22', 'przepustka zmienia opis planów, do którego odsyła oświadczenie');
	});
});
