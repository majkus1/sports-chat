import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { PLANS, TRIAL } from '@/lib/billing/plans';

/**
 * Przewodnik po serwisie — treść modala „Przewodnik" w sekcji piłkarskiej.
 *
 * DLA KOGO. Dla kogoś, kto wchodzi pierwszy raz, szuka „co dziś zagrać" i chce w minutę
 * wiedzieć, co ten serwis robi, gdzie kliknąć i co dostanie. Nie dla nas. Stąd forma: jedna
 * ścieżka z rozgałęzieniem (szukasz sam / bierzesz gotowe), jeden przykład typu z liczbami
 * i lista zakładek z jednym zdaniem przy każdej.
 *
 * ZASADY TEKSTU. Żadnych słów w rodzaju „kalibracja", „norma", „model Dixona-Colesa",
 * „przewaga nad rynkiem". Każde pojęcie tłumaczone zdaniem. Liczby (próg typu, limity
 * planów) pochodzą z kodu, nie są przepisane — jeśli zmieni się polityka albo cennik,
 * ten tekst zmieni się sam. Strona „Jak to działa" (`method.js`) tłumaczy SKĄD liczby;
 * ten przewodnik tłumaczy CO Z NIMI ZROBIĆ. Nie dublują się.
 *
 * ZAKŁADKI `key` odpowiadają pozycjom `FootballMenu`, żeby modal mógł linkować do nich
 * tymi samymi adresami.
 */


export function guideContent(locale) {
	const free = PLANS.free.limits;
	const pro = PLANS.pro.limits;

	if (locale === 'en') {
		return {
			title: 'What is this and how do I use it',
			lead: 'We calculate, from the results of thousands of matches, where a pick is worth making — and the AI explains why in plain words. You decide.',
			flow: {
				title: 'Your path in three steps',
				start: { title: 'Open the fixture list', body: 'Tab “Pre-match”. Every match the model has run is marked.' },
				fork: {
					self: {
						label: 'Looking yourself',
						items: [
							{ mark: '✦', text: 'The badge next to a match means: the model sees an edge here. On Pro and VIP the badge also shows which pick and by how much.' },
							{ mark: '5', text: '“Model sees” — the five strongest picks of the day, next to the list.' },
							{ mark: '→', text: 'Click a match → AI analysis: the numbers from the model plus reasons and risks in plain words. Ask the AI anything, even about injuries from the web.' },
						],
					},
					ready: {
						label: 'Want it ready-made',
						items: [
							{ mark: '☰', text: 'AI Report — the strongest picks from the whole schedule for the next 24 h or 3 days.' },
							{ mark: '✉', text: 'Morning email at 8:00 — today’s picks and yesterday’s results.' },
							{ mark: '?', text: 'Assistant — ask “where does the model see picks today?” and get a list with links.' },
						],
					},
				},
				pick: {
					title: 'You get a pick that looks like this',
					example: 'Legia Warszawa (home) · 66% (usually 44%)',
					explain: [
						'66% — the model’s chance that it happens.',
						'usually 44% — how often it happens anyway, in any match like this, without looking at the teams.',
						`We only call it a pick when the chance is at least ${MIN_PROBABILITY}% AND at least ${MIN_LIFT} points above “usually”. Otherwise we say nothing — no pick is an honest answer.`,
						'It is an edge, not a sure thing. A pick at 66% will miss one time in three.',
					],
				},
				settle: {
					title: 'After the match we settle it',
					body: 'Hit or miss — every pick is checked against the official result and published in “Accuracy”, next to how often “usually” would have hit. Misses included.',
				},
			},
			markets: {
				title: 'What we pick',
				yes: ['Match result (home or away win)', 'Double chance (1X or X2)', 'A team scores at least one goal', 'Over 2.5 goals'],
				noTitle: 'What we don’t',
				no: 'Both teams to score, under 2.5, exact score. We checked on thousands of matches: nobody predicts those better than the league average, so a pick there would be worse than none. We never quote odds.',
			},
			tabs: {
				title: 'Where to find what',
				items: [
					{ key: 'przedmeczowe', name: 'Pre-match', body: 'the fixture list with badges and “Model sees”.' },
					{ key: 'live', name: 'Live', body: 'matches in progress, with live analysis on Pro and VIP.' },
					{ key: 'ai-agent', name: 'AI Report', body: 'ready-made picks for 24 h or 3 days.' },
					{ key: 'asystent', name: 'Assistant', body: 'ask about matches, picks, accuracy, news.' },
					{ key: 'kolejka', name: 'Round', body: 'make your own picks and compare with the model and others.' },
					{ key: 'skutecznosc', name: 'Accuracy', body: 'how our picks are doing — publicly, match by match.' },
				],
			},
			plans: {
				title: 'Free or paid',
				free: `Free: ${free.analysis} analyses and ${free.aiChat} assistant questions a month, badges without numbers. New account: ${TRIAL.limits.analysis} analyses, ${TRIAL.limits.aiChat} questions and ${TRIAL.limits.report} reports for ${TRIAL.days} days to try everything.`,
				pro: `Pro (${PLANS.pro.priceMonthlyPln} zł / 30 days): ${pro.analysis} analyses, ${pro.report} reports, badges with numbers, live analyses, morning email, web news.`,
				link: 'See plans',
			},
			close: 'Close',
		};
	}

	return {
		title: 'Co to jest i jak z tego korzystać',
		lead: 'Liczymy, z wyników tysięcy meczów, gdzie warto typować — a AI tłumaczy dlaczego, po ludzku. Ty decydujesz.',
		flow: {
			title: 'Twoja ścieżka w trzech krokach',
			start: { title: 'Wchodzisz na listę meczów', body: 'Zakładka „Przedmeczowe". Każdy mecz, który model policzył, jest oznaczony.' },
			fork: {
				self: {
					label: 'Szukasz sam',
					items: [
						{ mark: '✦', text: 'Plakietka przy meczu znaczy: model widzi tu przewagę. W Pro i VIP plakietka pokazuje też jaki typ i o ile.' },
						{ mark: '5', text: '„Model widzi" — pięć najmocniejszych typów dnia, obok listy.' },
						{ mark: '→', text: 'Klikasz mecz → analiza AI: liczby z modelu plus powody i ryzyka po ludzku. Dopytasz AI o cokolwiek, nawet o kontuzje z internetu.' },
					],
				},
				ready: {
					label: 'Chcesz gotowe',
					items: [
						{ mark: '☰', text: 'Raport AI — najmocniejsze typy z całej oferty na najbliższe 24 h albo 3 dni.' },
						{ mark: '✉', text: 'Poranny mail o 8:00 — typy na dziś i rozliczenie wczorajszych.' },
						{ mark: '?', text: 'Asystent — pytasz „gdzie model widzi dziś typy?" i dostajesz listę z linkami.' },
					],
				},
			},
			pick: {
				title: 'Dostajesz typ, który wygląda tak',
				example: 'Legia Warszawa (gospodarze) · 66% (zwykle 44%)',
				explain: [
					'66% — szansa według modelu, że to się stanie.',
					'zwykle 44% — tyle razy dzieje się to samo z siebie, w każdym takim meczu, bez patrzenia na drużyny.',
					`Typ nazywamy typem tylko wtedy, gdy szansa wynosi co najmniej ${MIN_PROBABILITY}% ORAZ jest co najmniej ${MIN_LIFT} punktów nad „zwykle". Inaczej milczymy — brak typu to uczciwa odpowiedź.`,
					'To przewaga, nie pewniak. Typ na 66% nie trafi raz na trzy.',
				],
			},
			settle: {
				title: 'Po meczu rozliczamy',
				body: 'Trafił albo nie — każdy typ sprawdzamy z oficjalnym wynikiem i publikujemy w „Skuteczności", obok tego, ile trafiłoby samo „zwykle". Z nietrafionymi włącznie.',
			},
		},
		markets: {
			title: 'Co typujemy',
			yes: ['Wynik meczu (wygrana gospodarzy albo gości)', 'Podwójna szansa (1X albo X2)', 'Drużyna strzeli choć jednego gola', 'Powyżej 2,5 gola w meczu'],
			noTitle: 'Czego nie',
			no: 'Obie strzelą, poniżej 2,5, dokładny wynik. Sprawdziliśmy na tysiącach meczów: nikt nie przewiduje tego lepiej niż średnia ligowa, więc typ byłby gorszy niż jego brak. Kursów nie podajemy nigdy.',
		},
		tabs: {
			title: 'Gdzie co znaleźć',
			items: [
				{ key: 'przedmeczowe', name: 'Przedmeczowe', body: 'lista meczów z plakietkami i „Model widzi".' },
				{ key: 'live', name: 'Na żywo', body: 'mecze w trakcie, w Pro i VIP z analizą na żywo.' },
				{ key: 'ai-agent', name: 'Raport AI', body: 'gotowe typy na 24 h albo 3 dni.' },
				{ key: 'asystent', name: 'Asystent', body: 'pytasz o mecze, typy, skuteczność, wiadomości.' },
				{ key: 'kolejka', name: 'Kolejka', body: 'typujesz sam i porównujesz się z modelem i innymi.' },
				{ key: 'skutecznosc', name: 'Skuteczność', body: 'jak idzie naszym typom — publicznie, mecz po meczu.' },
			],
		},
		plans: {
			title: 'Za darmo czy płatnie',
			free: `Za darmo: ${free.analysis} analiz i ${free.aiChat} pytań do asystenta miesięcznie, plakietki bez liczb. Nowe konto: ${TRIAL.limits.analysis} analiz, ${TRIAL.limits.aiChat} pytań i ${TRIAL.limits.report} raporty na ${TRIAL.days} dni, żeby sprawdzić wszystko.`,
			pro: `Pro (${PLANS.pro.priceMonthlyPln} zł / 30 dni): ${pro.analysis} analiz, ${pro.report} raportów, plakietki z liczbami, analizy na żywo, poranny mail, wiadomości z internetu.`,
			link: 'Zobacz plany',
		},
		close: 'Zamknij',
	};
}
