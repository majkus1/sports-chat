import { PLANS, PLAN_PASS_DAYS, PRO_WEEK, TRIAL, CREDIT_PACKS } from '@/lib/billing/plans';
import { COUPON_TYPES } from '@/lib/coupons/build';
import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Pytania i odpowiedzi: dziesięć na stronie głównej (`faqItems`), reszta na „Jak to działa"
 * (`methodFaqItems`).
 *
 * Jedno źródło dla widocznej sekcji i dla danych strukturalnych `FAQPage` każdej z tych stron —
 * gdyby treści się rozeszły, wyszukiwarka pokazywałaby w wynikach coś innego niż użytkownik na
 * stronie, co jest naruszeniem wytycznych i realnym ryzykiem utraty wyniku rozszerzonego.
 *
 * DLACZEGO DZIESIĘĆ (22.11.2026). Było 23 pytania i ok. 1100 słów — kibic nie czyta ściany
 * pytań, szuka dwóch-trzech: czy to darmowe, co znaczą liczby, czy się odnawia. Te zostały na
 * stronie głównej, każda odpowiedź do ok. 40 słów (kupony dłużej, bo muszą mieć zastrzeżenia).
 * Trzy pytania scalone (płatność, kredyty, skuteczność), pozostałe przeszły na „Jak to działa",
 * gdzie dalej służą wyszukiwarce. Żadne pytanie nie stoi na obu stronach naraz.
 *
 * Liczby pochodzą z definicji planów, kuponów i polityki typów, więc nie rozjadą się z cennikiem
 * po żadnej zmianie.
 *
 * KURSY TYLKO W PYTANIU O KUPONY. Reszta FAQ (jak strona główna) nie mówi o kursach — kupon
 * bez kursu łącznego nie ma jednak sensu, więc tam kurs pada, razem z zastrzeżeniami: mediana
 * kilku bukmacherów bez odnośników, szacunki, serwis nie przyjmuje zakładów, 18+. Pilnuje tego
 * `test/landing/content.test.mjs`.
 */

const free = PLANS.free.limits;
const najtanszyPakiet = CREDIT_PACKS[0];
const { daily: kuponDnia, days3: kupon3, days5: kupon5 } = COUPON_TYPES;
const kurs = (locale, v) => (locale === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ','));

/** Strona główna: dziesięć pytań, krótkie odpowiedzi. */
export function faqItems(locale) {
	if (locale === 'en') {
		return [
			{
				question: 'What is Sports Chat?',
				answer:
					'A service with football picks and match analysis. A numbers model works out the chances, the AI ' +
					'explains them in plain words, and every pick is settled in public after the match.',
			},
			{
				question: 'Is it free?',
				answer:
					`Yes. A new account gets ${TRIAL.days} days of all picks and coupons, plus ${TRIAL.limits.analysis} ` +
					`analyses and ${TRIAL.limits.report} reports to start. After that ${free.analysis} analyses and ` +
					`${free.aiChat} assistant questions a month stay free.`,
			},
			{
				question: 'What does “66% (usually 44%)” next to a pick mean?',
				answer:
					'66% is the chance according to the model or the market — the pick says which. “Usually 44%” is ' +
					`how often it happens in an average match. We show a pick from ${MIN_PROBABILITY}% and at least ` +
					`${MIN_LIFT} points above “usually”.`,
			},
			{
				question: 'What kinds of picks does the model make?',
				answer:
					'Four: match result, double chance (1X or X2), a team to score and over 2.5 goals. Both teams to ' +
					'score, under 2.5 and the exact score are not picked — nobody predicts them better than the league average.',
			},
			{
				question: `What are the coupons: daily, ${kupon3.days}-day and ${kupon5.days}-day?`,
				answer:
					`A few of the model’s strongest picks: at most ${kuponDnia.maxLegs} (${kupon5.days}-day: ` +
					`${kupon5.maxLegs}), total odds ${kurs('en', kuponDnia.target)}–${kurs('en', kuponDnia.max)} ` +
					`(${kupon5.days}-day: ${kurs('en', kupon5.target)}–${kurs('en', kupon5.max)}). The coupon of the day is ` +
					`free for everyone; the ${kupon3.days}- and ${kupon5.days}-day ones are on Pro and VIP and for ` +
					`${TRIAL.days} days on a new account. Odds are the median of several bookmakers, with no ` +
					'links. Estimates, not a promised result. The service does not take bets. 18+.',
			},
			{
				question: 'How do I pay? Does it renew?',
				answer:
					`You pay once — BLIK, Przelewy24 or card, via Stripe — for ${PRO_WEEK.days} or ${PLAN_PASS_DAYS} days. ` +
					'Afterwards the account returns to free on its own; nothing renews. Credits (from ' +
					`${najtanszyPakiet.priceGrosze / 100} zł) never expire.`,
			},
			{
				// Scalone z „jaka jest skuteczność" — rejestr typów (`/pilka-nozna/skutecznosc?view=register`).
				question: 'How do I know you don’t add picks after the match?',
				answer:
					'Every pick goes into the public register before kick-off, with its time. A recorded pick cannot be ' +
					'changed, and misses sit next to hits. The register and the accuracy are on the Accuracy page.',
			},
			{
				question: 'What does the assistant do?',
				answer:
					'It answers questions about any match, pick or coupon — with the model’s numbers and links to the ' +
					'matches. On Pro and VIP it also checks the web for injuries and line-ups, with sources.',
			},
			{
				question: 'Do I need an account?',
				answer:
					'Not for the fixture list, the pick of the day or the accuracy page. A free account (no card) is ' +
					'needed for analyses, the assistant, the chat and your own picks.',
			},
			{
				question: 'Is this a bookmaker? Do you take bets?',
				answer:
					'No. We do not take bets or stakes and do not pay out winnings. The content is informational and ' +
					'statistical — not advice. 18+.',
			},
		];
	}

	return [
		{
			question: 'Czym jest Czat Sportowy?',
			answer:
				'Serwisem z typami i analizami meczów piłkarskich. Model liczy szanse, AI tłumaczy je po ludzku, ' +
				'a każdy typ rozliczamy publicznie po meczu.',
		},
		{
			question: 'Czy korzystanie jest darmowe?',
			answer:
				`Tak. Nowe konto ma ${TRIAL.days} dni wszystkich typów i kuponów oraz ${TRIAL.limits.analysis} ` +
				`${odmien(TRIAL.limits.analysis, ANALIZY)} i ${TRIAL.limits.report} ${odmien(TRIAL.limits.report, RAPORTY)} ` +
				`na start. Potem ${free.analysis} ${odmien(free.analysis, ANALIZY)} i ${free.aiChat} ` +
				`${odmien(free.aiChat, PYTANIA)} do asystenta miesięcznie za darmo.`,
		},
		{
			question: 'Co znaczy „66% (zwykle 44%)" przy typie?',
			answer:
				'66% to szansa według modelu albo rynku — przy typie widać, skąd. „Zwykle 44%" to jak często dzieje ' +
				`się to w przeciętnym meczu. Typ pokazujemy od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} punktów ` +
				'ponad „zwykle".',
		},
		{
			question: 'Jakie typy wystawia model?',
			answer:
				'Cztery rodzaje: wynik meczu, podwójna szansa (1X albo X2), gol drużyny i powyżej 2,5 gola. ' +
				'„Obie strzelą", „poniżej 2,5" i dokładnego wyniku nie typujemy — nikt nie przewiduje ich lepiej ' +
				'niż średnia ligowa.',
		},
		{
			question: `Czym są kupony: dnia, ${kupon3.days}- i ${kupon5.days}-dniowy?`,
			answer:
				`Kupon to kilka najmocniejszych typów modelu: najwyżej ${kuponDnia.maxLegs} (${kupon5.days}-dniowy: ` +
				`${kupon5.maxLegs}), kurs łączny ${kurs('pl', kuponDnia.target)}–${kurs('pl', kuponDnia.max)} ` +
				`(${kupon5.days}-dniowy: ${kurs('pl', kupon5.target)}–${kurs('pl', kupon5.max)}). Kupon dnia jest za darmo ` +
				`dla każdego, ${kupon3.days}- i ${kupon5.days}-dniowy — w Pro i VIP oraz przez ${TRIAL.days} dni po ` +
				'założeniu konta. Kursy to mediana kilku bukmacherów, bez odnośników. To szacunki, nie obietnica ' +
				'wyniku. Serwis nie przyjmuje zakładów. 18+.',
		},
		{
			question: 'Jak zapłacić? Czy płatność się odnawia?',
			answer:
				`Płacisz raz — BLIK, Przelewy24 albo karta, przez Stripe — za ${PRO_WEEK.days} albo ${PLAN_PASS_DAYS} dni. ` +
				'Potem konto samo wraca do darmowego, nic się nie odnawia. Kredyty (od ' +
				`${najtanszyPakiet.priceGrosze / 100} zł) nie wygasają.`,
		},
		{
			// Scalone z „jaka jest skuteczność" — rejestr typów (`/pilka-nozna/skutecznosc?view=register`).
			question: 'Skąd mam wiedzieć, że nie dopisujecie typów po meczu?',
			answer:
				'Każdy typ trafia do publicznego rejestru przed pierwszym gwizdkiem, z godziną zapisu. Zapisanego ' +
				'nie da się zmienić, a chybione stoją obok trafionych. Rejestr i skuteczność są w zakładce Skuteczność.',
		},
		{
			question: 'Co robi asystent?',
			answer:
				'Odpowiada na pytania o dowolny mecz, typ albo kupon — liczbami modelu i z linkami do meczów. ' +
				'W Pro i VIP sprawdzi też w internecie kontuzje i składy, ze źródłem.',
		},
		{
			question: 'Czy potrzebuję konta?',
			answer:
				'Do listy meczów, typu dnia i skuteczności — nie. Darmowe konto (bez karty) jest potrzebne do ' +
				'analiz, asystenta, czatu i własnych typów.',
		},
		{
			question: 'Czy to bukmacher? Czy przyjmujecie zakłady?',
			answer:
				'Nie. Nie przyjmujemy zakładów ani stawek i nie wypłacamy wygranych. Treści są informacyjne ' +
				'i statystyczne — to nie porada. 18+.',
		},
	];
}

/**
 * Strona „Jak to działa": pytania, które zeszły ze strony głównej. Dla dociekliwych i dla
 * wyszukiwarki — odpowiedzi mogą być dłuższe, ale bez kursów (jak reszta FAQ poza kuponami).
 */
export function methodFaqItems(locale) {
	if (locale === 'en') {
		return [
			{
				question: 'What is the badge next to a match and “Model sees”?',
				answer:
					'The badge means the model has run that match and sees a pick in it. On Pro and VIP (and for your ' +
					`first ${TRIAL.days} days after you create an account) it also shows which pick and by how much. ` +
					'“Model sees” is the strongest picks of the day, next to the fixture list.',
			},
			{
				question: 'How is an AI analysis produced?',
				answer:
					'First the numbers model: from two seasons of results it works out each team’s attack and defence, ' +
					'and from that the chances and picks. Then the AI gets those numbers with the facts about the match — ' +
					'form, table, line-ups, injuries, statistics — and explains what stands behind them. It may not change the numbers.',
			},
			{
				question: 'Where does the match data come from?',
				answer:
					'From a commercial sports data provider: fixtures, live results, line-ups, injuries, tables and team ' +
					'statistics. We do not scrape other services.',
			},
			{
				question: 'Does the model learn?',
				answer:
					'Team strengths are recalculated every six hours from the latest results. Every forecast is logged ' +
					'and checked against the result, so we can see whether “66%” really hits 66% — and fix it if it doesn’t.',
			},
			{
				question: 'Can I place my own picks?',
				answer:
					'Yes, on any fixture before kick-off, from a closed list so every pick can be settled. Your picks and ' +
					'the AI picks are counted separately.',
			},
			{
				question: 'What is the weekly round?',
				answer:
					'The same twelve matches for everyone, one closing time and a leaderboard that resets each week — ' +
					'against other fans and against the model.',
			},
			{
				question: 'Can I talk to other fans?',
				answer:
					'Yes. Every match has its own live room; the history stays after the final whistle and you can move ' +
					'to a private conversation. Writing needs an account, reading does not.',
			},
			{
				question: 'Which sports are covered?',
				answer: 'Football for now, across the major European and international competitions. More sports are planned.',
			},
			{
				question: 'Is there an English version?',
				answer: 'Yes. The interface, analyses and reports are available in Polish and English.',
			},
			{
				question: 'Who is the service for?',
				answer:
					'Adults aged 18 or over who follow football and want data in one place instead of five tabs. ' +
					'The content is informational and statistical, not betting advice.',
			},
		];
	}

	return [
		{
			question: 'Co to jest plakietka przy meczu i „Model widzi"?',
			answer:
				'Plakietka znaczy, że model policzył ten mecz i widzi w nim typ. W Pro i VIP (oraz przez pierwsze ' +
				`${TRIAL.days} dni po założeniu konta) pokazuje też jaki typ i o ile. „Model widzi" to najmocniejsze ` +
				'typy dnia obok listy meczów.',
		},
		{
			question: 'Jak powstaje analiza AI?',
			answer:
				'Najpierw liczy model: z wyników dwóch sezonów wylicza siłę ataku i obrony obu drużyn, a z niej szanse ' +
				'i typy. Potem AI dostaje te liczby razem z faktami o meczu — formą, tabelą, składami, kontuzjami, ' +
				'statystykami — i tłumaczy, co za nimi stoi. Liczb nie wolno jej zmieniać.',
		},
		{
			question: 'Skąd biorą się dane o meczach?',
			answer:
				'Z komercyjnego dostawcy danych sportowych: terminarze, wyniki na żywo, składy, kontuzje, tabele ' +
				'i statystyki drużynowe. Nie pobieramy treści z innych serwisów.',
		},
		{
			question: 'Czy model się uczy?',
			answer:
				'Siły drużyn przelicza co sześć godzin z najnowszych wyników. Każdą prognozę zapisujemy i sprawdzamy ' +
				'z wynikiem — dzięki temu widzimy, czy „66%" naprawdę trafia w 66%, i poprawiamy, gdy nie trafia.',
		},
		{
			question: 'Czy mogę wystawiać własne typy?',
			answer:
				'Tak, przy każdym meczu przed pierwszym gwizdkiem, z zamkniętej listy, żeby każdy typ dało się ' +
				'rozliczyć. Twoje typy i typy AI liczymy osobno.',
		},
		{
			question: 'Czym jest kolejka tygodniowa?',
			answer:
				'Te same dwanaście meczów dla wszystkich, jeden termin zamknięcia i ranking liczony od nowa co ' +
				'tydzień — z innymi kibicami i z modelem.',
		},
		{
			question: 'Czy mogę rozmawiać z innymi kibicami?',
			answer:
				'Tak. Każdy mecz ma własny pokój na żywo, historia zostaje po ostatnim gwizdku, a z każdej osoby ' +
				'przejdziesz na rozmowę prywatną. Do pisania potrzebne jest konto, czytać można bez logowania.',
		},
		{
			question: 'Jakie sporty obsługujecie?',
			answer: 'Na razie piłkę nożną, w najważniejszych rozgrywkach europejskich i międzynarodowych. Kolejne dyscypliny są w planach.',
		},
		{
			question: 'Czy jest wersja angielska?',
			answer: 'Tak. Interfejs, analizy i raporty są dostępne po polsku i po angielsku.',
		},
		{
			question: 'Dla kogo jest ten serwis?',
			answer:
				'Dla pełnoletnich kibiców piłki nożnej, którzy chcą mieć dane w jednym miejscu zamiast w pięciu ' +
				'zakładkach. Treści mają charakter informacyjny i statystyczny, nie są poradą bukmacherską.',
		},
	];
}
