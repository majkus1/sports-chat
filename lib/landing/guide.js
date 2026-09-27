import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { PLANS } from '@/lib/billing/plans';

/**
 * Przewodnik — treść modala „Przewodnik" w sekcji piłkarskiej.
 *
 * JEDEN EKRAN, JEDNA DECYZJA. Pierwsza wersja tłumaczyła wszystko (rynki, zakładki, plany)
 * i czytało się ją jak regulamin. Ten modal ma zrobić jedno: w pięć sekund pokazać, co
 * dostajesz, i wysłać na listę meczów. Stąd: tytuł z obietnicą, dwie żywe liczby (ile typów
 * model ma dziś, jak trafia), jeden przykład typu, trzy kroki po kilka słów i duży przycisk.
 * Szczegóły mieszkają na stronie „Jak to działa" i w cenniku — tu tylko link.
 *
 * Liczby (próg typu, limit darmowy) pochodzą z kodu, żeby tekst nie rozjechał się z polityką.
 */
export function guideContent(locale) {
	const darmowe = PLANS.free.limits.analysis;

	if (locale === 'en') {
		return {
			kicker: 'How it works in 10 seconds',
			title: 'The model scans hundreds of matches. You see only the ones where it has an edge.',
			live: {
				today: 'model picks today',
				accuracy: 'picks hit · last 90 days',
			},
			example: {
				label: 'Example pick',
				match: 'Germany – Greece',
				pick: 'Germany to win',
				probability: 68,
				usual: 44,
				caption: '68% — the model’s chance. Usually 44% — how often it happens anyway.',
			},
			steps: [
				{ icon: 'list', title: 'Open the matches', body: '✦ next to a match = the model sees an edge' },
				{ icon: 'click', title: 'Click the match', body: 'Numbers, reasons and risks — in plain words' },
				{ icon: 'check', title: 'Check it after', body: 'Every pick is settled in public' },
			],
			threshold: `A pick only from ${MIN_PROBABILITY}% and ${MIN_LIFT} points above “usually”. Otherwise we stay quiet.`,
			cta: 'See today’s picks',
			ctaSecondary: 'Ask the assistant',
			tabs: {
				title: 'Also',
				items: [
					{ key: 'przedmeczowe', name: 'Pre-match' },
					{ key: 'live', name: 'Live' },
					{ key: 'ai-agent', name: 'AI Report' },
					{ key: 'asystent', name: 'Assistant' },
					{ key: 'kolejka', name: 'Round' },
					{ key: 'skutecznosc', name: 'Accuracy' },
				],
			},
			footnote: `Free to start: ${darmowe} analyses a month, no card. Estimates, not sure things.`,
			close: 'Close',
		};
	}

	return {
		kicker: 'Jak to działa w 10 sekund',
		title: 'Model przegląda setki meczów. Ty widzisz tylko te, w których ma przewagę.',
		live: {
			today: 'typów modelu na dziś',
			accuracy: 'trafionych · ostatnie 90 dni',
		},
		example: {
			label: 'Przykładowy typ',
			match: 'Niemcy – Grecja',
			pick: 'Niemcy wygrają',
			probability: 68,
			usual: 44,
			caption: '68% — szansa według modelu. Zwykle 44% — tyle dzieje się samo z siebie.',
		},
		steps: [
			{ icon: 'list', title: 'Otwórz mecze', body: '✦ przy meczu = model widzi przewagę' },
			{ icon: 'click', title: 'Kliknij mecz', body: 'Liczby, powody i ryzyka — po ludzku' },
			{ icon: 'check', title: 'Sprawdź po meczu', body: 'Każdy typ rozliczamy publicznie' },
		],
		threshold: `Typ tylko od ${MIN_PROBABILITY}% i ${MIN_LIFT} pkt ponad „zwykle". Inaczej milczymy.`,
		cta: 'Zobacz dzisiejsze typy',
		ctaSecondary: 'Zapytaj asystenta',
		tabs: {
			title: 'Poza tym',
			items: [
				{ key: 'przedmeczowe', name: 'Przedmeczowe' },
				{ key: 'live', name: 'Na żywo' },
				{ key: 'ai-agent', name: 'Raport AI' },
				{ key: 'asystent', name: 'Asystent' },
				{ key: 'kolejka', name: 'Kolejka' },
				{ key: 'skutecznosc', name: 'Skuteczność' },
			],
		},
		footnote: `Za darmo na start: ${darmowe} analiz miesięcznie, bez karty. To szacunki, nie pewniaki.`,
		close: 'Zamknij',
	};
}
