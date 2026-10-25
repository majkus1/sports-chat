import { PLAN_PASS_DAYS, PLANS, TRIAL } from '@/lib/billing/plans';
import { COUPON_TYPES } from '@/lib/coupons/build';
import { CUSTOM_ODDS } from '@/lib/coupons/custom';
import { ANALIZY, DNI, PYTANIA, odmien } from '@/lib/landing/plural';

/**
 * Pozycje cennika i liczby do tekstów o planach.
 *
 * DLACZEGO OSOBNY PLIK. Limity w kartach cennika od początku szły z `PLANS`, ale zdania obok —
 * baner okresu próbnego, „opłacasz 30 dni", podpowiedź przy raportach — miały liczby wpisane
 * w `messages/*.json`. Podpowiedź przy raportach obiecywała „2 raporty tygodniowo" w planie
 * darmowym, który raportów nie ma wcale. Teraz tłumaczenia mają same miejsca na liczby,
 * a liczby przychodzą stąd — test (`test/billing/planTexts`) sprawdza jedno i drugie.
 */

/** Limity: [rodzaj z `plan.limits`, etykieta, objaśnienie w słowniczku]. */
export const QUOTA_ROWS = [
	['analysis', 'pricing_analyses', 'pricing_what_analyses'],
	['analysisView', 'pricing_analysis_view', 'pricing_what_analysis_view'],
	['aiChat', 'pricing_ai_chat', 'pricing_what_ai_chat'],
	['aiNews', 'pricing_ai_news', 'pricing_what_ai_news'],
	['report', 'pricing_reports', 'pricing_what_reports'],
	// Kreator kuponu — jedyny limit dzienny obok czytania analiz; karta dopisze „/ dzień" z `QUOTA_PERIODS`.
	['couponGen', 'pricing_coupon_gen', 'pricing_what_coupon_gen'],
];

/** Funkcje: [cecha z `plan.features`, etykieta, objaśnienie w słowniczku]. */
export const FEATURE_ROWS = [
	['model_hints', 'pricing_model_hints', 'pricing_what_model_hints'],
	/*
	 * Ta sama cecha co liczby przy typach odkrywa kupony na 3 i 5 dni oraz kupon live
	 * (`lib/coupons/access.js`). Osobny wiersz, bo z „typów na liście meczów" nikt by tego
	 * nie wyczytał — a „Odblokuj kupon" prowadzi właśnie do cennika.
	 */
	['model_hints', 'pricing_coupons', 'pricing_what_coupons'],
	['live_analysis', 'pricing_live_analysis', 'pricing_what_live_analysis'],
	['morning_email', 'pricing_morning_email', 'pricing_what_morning_email'],
];

const kurs = (locale, v) =>
	v.toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Parametry tekstów z liczbami: klucz w `messages/*.json` → wartości do `t(klucz, wartości)`.
 * Kupony 3- i 5-dniowy mają dziś ten sam przedział, więc wystarcza jeden.
 */
export function planMessageParams(locale) {
	return {
		pricing_trial: {
			days: TRIAL.days,
			analyses: TRIAL.limits.analysis,
			questions: TRIAL.limits.aiChat,
			reports: TRIAL.limits.report,
		},
		pricing_one_off_note: { days: PLAN_PASS_DAYS },
		pricing_what_coupons: {
			from: kurs(locale, COUPON_TYPES.days3.target),
			to: kurs(locale, COUPON_TYPES.days3.max),
		},
		// „ok. 2,0, 2,5 albo 3,0" — cele kreatora z `CUSTOM_ODDS`.
		pricing_what_coupon_gen: {
			odds: `${locale === 'en' ? 'about' : 'ok.'} ${CUSTOM_ODDS.slice(0, -1)
				.map((o) => kurs(locale, o.nominal))
				.join(', ')} ${locale === 'en' ? 'or' : 'albo'} ${kurs(locale, CUSTOM_ODDS.at(-1).nominal)}`,
		},
		report_login_hint: { reports: TRIAL.limits.report, days: TRIAL.days },
		quota_reset_note: { days: PLAN_PASS_DAYS },
	};
}

/** Opis cennika w wynikach wyszukiwania (`app/[locale]/cennik`). */
export function pricingMetaDescription(locale) {
	const free = PLANS.free.limits;
	if (locale === 'en') {
		return (
			`Start free: ${free.analysis} analyses and ${free.aiChat} assistant questions a month, plus ${TRIAL.days} welcome days ` +
			`with model picks and coupons. Need more — buy credits once or pick a ${PLAN_PASS_DAYS}-day plan.`
		);
	}
	return (
		`Zacznij za darmo: ${free.analysis} ${odmien(free.analysis, ANALIZY)} i ${free.aiChat} ${odmien(free.aiChat, PYTANIA)} ` +
		`miesięcznie, a na start ${TRIAL.days} ${odmien(TRIAL.days, DNI)} z typami modelu i kuponami. Potrzebujesz więcej — ` +
		`dokup kredyty albo wybierz plan na ${PLAN_PASS_DAYS} dni.`
	);
}
