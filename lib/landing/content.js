import { PLANS, PRO_WEEK, TRIAL } from '@/lib/billing/plans';
import { COUPON_TYPES } from '@/lib/coupons/build';
import { ANALIZY, PYTANIA, odmien } from '@/lib/landing/plural';

/**
 * Treść strony głównej.
 *
 * Osobno od `messages/*.json`, bo to nie są etykiety interfejsu, tylko tekst sprzedażowy —
 * pisze się go inaczej, zmienia z innych powodów i czyta w całości, a nie klucz po kluczu.
 * W pliku tłumaczeń rozpłynąłby się między trzystoma krótkimi napisami.
 *
 * DLA KOGO. Dla kibica, który nie przychodzi czytać. W trzy sekundy ma wiedzieć: co dostaje
 * (typ dnia, kupony, analiza meczu), że start nic nie kosztuje (okres próbny) i gdzie kliknąć
 * (jeden przycisk rejestracji). Od 22.11.2026 strona ma ok. 350 słów zamiast ok. 900: metoda
 * jest na „Jak to działa", rzadsze pytania w FAQ tamtej strony, pełne limity w cenniku.
 *
 * SŁOWA. „Typy na dziś", „analizy meczów", „skuteczność" — to, czego ludzie szukają. Bez
 * „kalibracji", „modelu Dixona-Colesa" i bez języka zakładów: nie mówimy o kursach, stawkach
 * ani „obstawianiu" (treść informacyjna i statystyczna, nie porada bukmacherska).
 *
 * Liczby limitów, dni i cen pochodzą z kodu. Landing obiecujący co innego niż cennik albo
 * polityka typów to najprostszy sposób na utratę zaufania w pierwszej minucie korzystania.
 *
 * UCZCIWY PRZEKAZ (listopad 2026). Bez obietnic zysku i bez słów zachęcających do gry — to wymóg
 * polskich przepisów o reklamie hazardu, a do tego prawda: model jeszcze nie bije rynku (log loss
 * 0,971 wobec 0,946, CLV ok. +0,3%). Dlatego zamiast „przewagi" pokazujemy dowody, które każdy
 * może sprawdzić — i przegrane tak samo jak wygrane.
 */

const free = PLANS.free.limits;
const cenaTygodnia = PRO_WEEK.priceGrosze / 100;
const { days3: kupon3, days5: kupon5 } = COUPON_TYPES;

export function landingContent(locale) {
	if (locale === 'en') {
		return {
			hero: {
				eyebrow: 'Football · AI picks and analysis',
				title: 'AI match analysis and an assistant that knows the game',
				subtitle:
					'A free pick of the day and coupon of the day, every day. The AI explains every match — form, line-ups ' +
					'and risks — and every pick is settled in public, misses included.',
				ask: {
					label: 'Ask the AI assistant',
					placeholder: 'Ask about any match, pick or team…',
					button: 'Ask',
					hint: 'It knows today’s fixtures, the model’s picks and team news.',
					chips: ['What’s the strongest pick today?', 'Give me today’s coupon', 'Injury news before Barcelona’s match', 'How are your picks doing?'],
				},
				// Gość: rejestracja (okno w nawigacji). Zalogowany: prosto do typów.
				primaryCta: 'Create a free account',
				userCta: 'See today’s picks',
				guestLink: 'or see today’s picks',
				// Odnośnik do rejestru zostaje w nagłówku — sprawdzalny wynik od pierwszego ekranu.
				registerCta: 'See the pick register',
				trust: `No card · ${TRIAL.days} days of all picks and coupons for free`,
			},
			features: {
				title: 'What you get',
				items: [
					{ icon: 'FileText', title: 'Match analysis in 30 seconds', body: 'Chances, form and risks on one screen. Ask the AI for details.' },
					{
						icon: 'Target',
						title: 'Pick and coupons of the day',
						body: `Pick and coupon of the day for free. ${kupon3.days}- and ${kupon5.days}-day coupons on Pro.`,
					},
					{ icon: 'Bot', title: 'An assistant that knows every match', body: 'Ask about a match, a pick or a coupon. It answers with the model’s numbers.' },
					{ icon: 'Radio', title: 'Live', body: 'Analysis during the match and a live coupon from games in progress.' },
				],
			},
			register: {
				eyebrow: 'A record you can check',
				// Hasło z nagłówka strony (21–22.11.2026) — właściciel wolał w nagłówku poprzedni tytuł.
				title: 'AI match analysis in 30 seconds. A record you can check.',
				body: 'Every pick is recorded before the match, with its time. After it we add the result — misses shown just like hits.',
				fallback: 'The register loads live from the database — every pick with its record time and result, on the Accuracy page.',
				cta: 'Open the pick register',
			},
			pricing: {
				title: 'Start free',
				body:
					`First ${TRIAL.days} days: all picks and coupons for free. Then ${free.analysis} analyses and ` +
					`${free.aiChat} questions a month — or Pro from ${cenaTygodnia} zł.`,
				freeCta: 'Create a free account',
				cta: 'See pricing',
			},
			faq: { title: 'Frequently asked questions', more: 'More questions and the method:', moreLink: 'How it works' },
			finalCta: {
				title: `Start with ${TRIAL.days} days for free`,
				body: 'An account in a minute, no card.',
				cta: 'Create a free account',
				userTitle: 'Today’s picks are in',
				userBody: 'Pick of the day, coupons and every match with analysis.',
				userCta: 'See today’s picks',
			},
		};
	}

	return {
		hero: {
			eyebrow: 'Piłka nożna · typy i analizy AI',
			title: 'Analizy meczów od AI i asystent, który zna każdy mecz',
			subtitle:
				'Codziennie darmowy typ dnia i kupon dnia. AI wyjaśnia każdy mecz — formę, składy i ryzyka — ' +
				'a każdy typ rozliczamy publicznie, także chybione.',
			ask: {
				label: 'Zapytaj asystenta AI',
				placeholder: 'Zapytaj o dowolny mecz, typ albo drużynę…',
				button: 'Zapytaj',
				hint: 'Zna dzisiejsze mecze, typy modelu i wiadomości z klubów.',
				chips: ['Najmocniejszy typ na dziś?', 'Daj kupon na dziś', 'Kontuzje przed meczem Barcelony', 'Jak idzie waszym typom?'],
			},
			// Gość: rejestracja (okno w nawigacji). Zalogowany: prosto do typów.
			primaryCta: 'Załóż darmowe konto',
			userCta: 'Zobacz typy na dziś',
			guestLink: 'albo zobacz typy na dziś',
			// Odnośnik do rejestru zostaje w nagłówku — sprawdzalny wynik od pierwszego ekranu.
			registerCta: 'Zobacz rejestr typów',
			trust: `Bez karty · ${TRIAL.days} dni wszystkich typów i kuponów za darmo`,
		},
		features: {
			title: 'Co dostajesz',
			items: [
				{ icon: 'FileText', title: 'Analiza meczu w 30 sekund', body: 'Szanse, forma i ryzyka na jednym ekranie. Dopytasz AI o szczegóły.' },
				{
					icon: 'Target',
					title: 'Typ dnia i kupony',
					body: `Typ dnia i kupon dnia za darmo. Kupony na ${kupon3.days} i ${kupon5.days} dni w Pro.`,
				},
				{ icon: 'Bot', title: 'Asystent, który zna każdy mecz', body: 'Zapytaj o mecz, typ albo kupon. Odpowiada liczbami modelu.' },
				{ icon: 'Radio', title: 'Na żywo', body: 'Analiza w trakcie meczu i kupon live z trwających spotkań.' },
			],
		},
		register: {
			eyebrow: 'Sprawdzalny wynik',
			// Hasło z nagłówka strony (21–22.11.2026) — właściciel wolał w nagłówku poprzedni tytuł.
			title: 'Analiza meczu od AI w 30 sekund. Wynik, który sprawdzisz.',
			body: 'Każdy typ zapisujemy przed meczem, z godziną. Po meczu dopisujemy wynik — chybione widać tak samo jak trafione.',
			fallback: 'Rejestr wczytuje się na żywo z bazy — każdy typ z godziną zapisu i wynikiem, w zakładce Skuteczność.',
			cta: 'Otwórz rejestr typów',
		},
		pricing: {
			title: 'Zacznij za darmo',
			body:
				`Pierwsze ${TRIAL.days} dni: wszystkie typy i kupony za darmo. Potem ${free.analysis} ` +
				`${odmien(free.analysis, ANALIZY)} i ${free.aiChat} ${odmien(free.aiChat, PYTANIA)} miesięcznie — ` +
				`albo Pro od ${cenaTygodnia} zł.`,
			freeCta: 'Załóż darmowe konto',
			cta: 'Zobacz cennik',
		},
		faq: { title: 'Najczęstsze pytania', more: 'Więcej pytań i metoda:', moreLink: 'Jak to działa' },
		finalCta: {
			title: `Zacznij od ${TRIAL.days} dni za darmo`,
			body: 'Konto w minutę, bez karty.',
			cta: 'Załóż darmowe konto',
			userTitle: 'Dzisiejsze typy już są',
			userBody: 'Typ dnia, kupony i analiza każdego meczu.',
			userCta: 'Zobacz typy na dziś',
		},
	};
}
