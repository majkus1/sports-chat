import { OPERATOR } from '@/lib/legal/operator';
import { CREDIT_COSTS, PLAN_PASS_DAYS, TRIAL } from '@/lib/billing/plans';
import { KREDYTY, odmien } from '@/lib/landing/plural';

/**
 * Treść regulaminu i polityki prywatności, po polsku i angielsku.
 *
 * Zasada redakcyjna: krótko i prawdziwie. Dokumenty opisują serwis taki, jaki jest w kodzie —
 * przy każdej zmianie zakresu usług trzeba tu zajrzeć, bo regulamin obiecujący nieistniejące
 * funkcje szkodzi bardziej, niż pomaga.
 *
 * Liczby, które dokumenty podają wprost (okres próbny, długość dostępu, cena operacji
 * w kredytach), idą z `lib/billing/plans.js`. Limity i ceny poszczególnych planów — nie: te
 * podaje strona „Plany i limity", która jest częścią regulaminu. Pilnuje tego
 * `test/legal/documents.test.mjs`.
 *
 * Struktura regulaminu wynika z art. 8 ust. 3 ustawy o świadczeniu usług drogą elektroniczną:
 * rodzaje i zakres usług, warunki świadczenia (w tym wymagania techniczne i zakaz treści
 * bezprawnych), warunki zawierania i rozwiązywania umów oraz tryb reklamacji. Do tego dochodzi
 * mechanizm zgłaszania treści bezprawnych z art. 16 aktu o usługach cyfrowych, bo serwis
 * przechowuje treści użytkowników (czat), oraz informacja o treściach generowanych przez AI.
 *
 * ODESŁANIA DO PLATFORMY ODR CELOWO NIE MA. Europejska platforma internetowego rozstrzygania
 * sporów została zlikwidowana rozporządzeniem 2024/3228 i wyłączona 20 lipca 2025 r.; regulaminy
 * odsyłające do niej wprowadzają dziś w błąd.
 */

const p = (text) => ({ type: 'p', text });
const ul = (items) => ({ type: 'ul', items });

/* ── Regulamin ─────────────────────────────────────────────────────────────────── */

const TERMS_PL = {
	title: 'Regulamin serwisu',
	updatedLabel: 'Obowiązuje od',
	intro:
		`Regulamin określa zasady korzystania z serwisu ${OPERATOR.siteName} (${OPERATOR.url}). ` +
		'Założenie konta oznacza jego akceptację.',
	sections: [
		{
			heading: 'Kto prowadzi serwis',
			blocks: [
				p(
					`${OPERATOR.name}, ${OPERATOR.address}, NIP ${OPERATOR.nip}, REGON ${OPERATOR.regon}. ` +
						`Kontakt we wszystkich sprawach — reklamacje, dane osobowe, zgłoszenia treści: ${OPERATOR.email}.`
				),
			],
		},
		{
			heading: 'Co daje serwis',
			blocks: [
				ul([
					'czat na żywo w pokojach przypisanych do meczów oraz wiadomości prywatne między użytkownikami,',
					'typy modelu statystycznego przy meczach na liście — w planie bezpłatnym samo oznaczenie, że model ma ' +
						'typ, a w planach płatnych i w okresie próbnym także jaki typ i z jaką przewagą — oraz typ dnia, ' +
						'dostępny dla każdego,',
					'analizy przedmeczowe generowane przez model językowy z danych sportowych, a w planach płatnych także ' +
						'analizy meczów w trakcie gry (okres próbny ich nie obejmuje),',
					'kupony, czyli zestawienia kilku typów modelu z kursem łącznym i szansą według modelu: kupon dnia dla ' +
						'każdego, a kupony 3- i 5-dniowy oraz kupon live (generator kuponu z meczów w trakcie gry) w planach ' +
						'płatnych i w okresie próbnym — bez tego dostępu widać kurs łączny, szansę i liczbę typów,',
					'raporty zbiorcze wskazujące wybrane spotkania z najbliższych dni, w tym raport „Wyższe kursy" z typami ' +
						'o wyższym kursie i mniejszej szansie,',
					'asystenta AI, który odpowiada na pytania o dany mecz (pod analizą oraz po wzmiance @AI w czacie ' +
						'meczowym) i o całą ofertę w zakładce Asystent — mecze, typy modelu, kupony, typy z wyższym kursem ' +
						'i skuteczność — z historią rozmów zapisywaną na koncie; w planach płatnych asystent na prośbę ' +
						'wyszukuje w internecie wiadomości o drużynach (np. kontuzje, składy) i podaje ich źródła,',
					'poranny mail z typami modelu na dany dzień i rozliczeniem poprzedniego — w planach płatnych i w okresie ' +
						'próbnym, wysyłany tylko wtedy, gdy użytkownik sam go włączy,',
					'własne typy z automatycznym rozliczaniem i statystyką skuteczności oraz publiczne rozliczenie typów ' +
						'modelu, typu dnia i kuponów,',
					'kolejkę tygodniową ze wspólnym zestawem meczów i rankingiem,',
					'listę ulubionych meczów.',
				]),
				p(
					'Wystarczy urządzenie z internetem i przeglądarką obsługującą JavaScript oraz pamięć ' +
						'lokalną. Do założenia konta potrzebny jest adres e-mail.'
				),
				p(
					'Dane sportowe, w tym kursy, pochodzą od zewnętrznego dostawcy. Nie odpowiadamy za ich kompletność ' +
						'ani poprawność — w szczególności za opóźnienia wyników na żywo, zmiany terminów spotkań ' +
						'oraz błędy w składach i statystykach.'
				),
			],
		},
		{
			heading: 'Czym serwis nie jest',
			blocks: [
				p(
					'Treści mają charakter informacyjny i statystyczny. Nie są poradą bukmacherską, ' +
						'rekomendacją inwestycyjną ani zachętą do gry.'
				),
				p(
					'Serwis nie urządza gier hazardowych ani zakładów wzajemnych, nie przyjmuje stawek ' +
						'i nie wypłaca wygranych. Typowanie służy wyłącznie rozrywce i porównaniu skuteczności, ' +
						'bez nagród pieniężnych.'
				),
				p(
					'Kursy przy kuponach i typach to mediana kursów kilku bukmacherów, pokazywana jako miara szansy ' +
						'według rynku — bez nazw bukmacherów i bez odnośników do nich. U konkretnego bukmachera kurs może ' +
						'być inny. Kupon jest zestawieniem typów modelu, a nie zakładem zawieranym za pośrednictwem serwisu.'
				),
				p(
					'Analizy, raporty, odpowiedzi asystenta i streszczenia wiadomości z internetu generuje model językowy, ' +
						'a typy i kupony wybiera model statystyczny — jedno i drugie może zawierać błędy, ' +
						'w tym rzeczowe. Podawane prawdopodobieństwa są szacunkami modelu, nie wartościami ' +
						'zweryfikowanymi. Wyniki historyczne nie gwarantują przyszłych. Treści oznaczone jako ' +
						'wygenerowane przez AI są nimi w istocie — nie redagujemy ich ręcznie.'
				),
				p(
					'Decyzje podjęte na podstawie treści serwisu użytkownik podejmuje samodzielnie i na własne ' +
						'ryzyko. Serwis jest przeznaczony dla osób pełnoletnich. Hazard może uzależniać — bezpłatna ' +
						'pomoc: 801 889 880.'
				),
			],
		},
		{
			heading: 'Konto i zasady korzystania',
			blocks: [
				p(
					'Rejestracja wymaga nazwy użytkownika, adresu e-mail i hasła albo logowania kontem Google, ' +
						'oraz potwierdzenia adresu e-mail. Konto jest osobiste i nie wolno go udostępniać.'
				),
				p('Zabronione jest publikowanie treści bezprawnych, w szczególności:'),
				ul([
					'wulgarnych, obraźliwych, nawołujących do nienawiści lub przemocy,',
					'naruszających prawa innych osób, w tym dobra osobiste i prawa autorskie,',
					'reklamujących zakłady wzajemne, gry hazardowe lub inne usługi,',
					'wprowadzających w błąd co do tożsamości autora.',
				]),
				p(
					'Zabronione jest też automatyczne pobieranie treści serwisu, obchodzenie limitów planu ' +
						'i zakładanie kont w tym celu.'
				),
				p(
					'W razie naruszenia możemy usunąć treść, ograniczyć dostęp do funkcji albo zablokować konto — ' +
						'informując o powodzie i umożliwiając odwołanie w trybie reklamacji. Użytkownik może usunąć ' +
						`konto w każdej chwili, pisząc na ${OPERATOR.email}; usuwamy je wraz z treściami w ciągu 14 dni.`
				),
			],
		},
		{
			heading: 'Zgłaszanie treści bezprawnych',
			blocks: [
				p(
					`Każdy może zgłosić treść uznaną za bezprawną na adres ${OPERATOR.email}. Zgłoszenie powinno ` +
						'wskazywać tę treść (najlepiej odnośnikiem), powód oraz dane kontaktowe zgłaszającego.'
				),
				p(
					'Zgłoszenie rozpatrujemy bez zbędnej zwłoki i informujemy zgłaszającego o decyzji. Autora ' +
						'usuniętej treści zawiadamiamy o powodzie usunięcia. Od decyzji przysługuje odwołanie na ten ' +
						'sam adres.'
				),
			],
		},
		{
			heading: 'Plany, kredyty i płatności',
			blocks: [
				p(
					'Serwis ma plan bezpłatny oraz plany płatne (Pro i VIP). Różnią się limitami analiz, raportów, ' +
						'pytań do asystenta i wyszukiwań wiadomości oraz dostępem do funkcji opisanych wyżej. Aktualne ' +
						`limity, ceny i zakres planów podaje strona „Plany i limity" (${OPERATOR.url}/pl/cennik) ` +
						'i stanowią one część regulaminu.'
				),
				p(
					`Przez pierwsze ${TRIAL.days} dni od założenia konta trwa okres próbny. Konto dostaje wtedy ` +
						'jednorazową pulę powitalną analiz, pytań do asystenta i raportów — ponad limity planu ' +
						'bezpłatnego — a także typy modelu z liczbami na liście meczów, kupony 3- i 5-dniowy, kupon live ' +
						'i poranny mail. Okres próbny nie obejmuje analiz meczów w trakcie gry ani wyszukiwania wiadomości ' +
						'w internecie — te są tylko w planach płatnych. Po jego upływie niewykorzystana pula przepada, ' +
						'a konto zostaje w planie bezpłatnym.'
				),
				p(
					`Limity planu płatnego odnawiają się co ${PLAN_PASS_DAYS} dni, licząc od dnia zakupu, a planu ` +
						'bezpłatnego — pierwszego dnia miesiąca kalendarzowego; tylko limit czytania gotowych analiz ' +
						'w planie bezpłatnym liczy się dziennie. Niewykorzystane limity nie przechodzą na kolejny okres.'
				),
				p(
					'Niezależnie od planu można kupić pakiet kredytów. Kredyt zużywa się dopiero po wyczerpaniu ' +
						`puli planu: analiza kosztuje ${CREDIT_COSTS.analysis} ${odmien(CREDIT_COSTS.analysis, KREDYTY)}, ` +
						`raport ${CREDIT_COSTS.report} ${odmien(CREDIT_COSTS.report, KREDYTY)}; pytania do asystenta ` +
						'i wyszukiwania wiadomości nie zużywają kredytów — działają wyłącznie w ramach limitu planu. ' +
						'Kredyty nie mają terminu ważności i nie podlegają wymianie na pieniądze. Przy zwrocie płatności ' +
						'odejmujemy odpowiadającą jej liczbę kredytów.'
				),
				p(
					`Plany płatne sprzedajemy jako dostęp na czas określony — ${PLAN_PASS_DAYS} dni od zakupu. Płatność jest ` +
						'jednorazowa: nic nie odnawia się automatycznie i nie ma czego wypowiadać. Po upływie ' +
						'opłaconych dni konto samo wraca do planu bezpłatnego, a kolejny okres kupuje się osobno. ' +
						'Zakup przed końcem trwającego okresu dokłada dni do pozostałych, więc nic nie przepada.'
				),
				p(
					'Płatności obsługuje Stripe Payments Europe Ltd. Nie mamy dostępu do danych karty. ' +
						'Dostępne metody to karta, BLIK i Przelewy24.'
				),
				p(
					'Zasady zwrotów i odstąpienia od umowy opisuje osobny dokument „Zwroty i odstąpienie od umowy", ' +
						'dostępny pod adresem ' +
						`${OPERATOR.url}/pl/zwroty. Stanowi on część niniejszego regulaminu.`
				),
			],
		},
		{
			heading: 'Reklamacje',
			blocks: [
				p(
					`Reklamacje przyjmujemy na ${OPERATOR.email}. Wystarczy nazwa użytkownika, opis problemu ` +
						'i oczekiwany sposób rozpatrzenia. Nie ograniczamy terminu na złożenie reklamacji ani zakresu ' +
						'spraw, których może dotyczyć.'
				),
				p(
					'Odpowiadamy w ciągu 14 dni na adres, z którego wysłano zgłoszenie. Konsument może też ' +
						'skorzystać z pomocy powiatowego lub miejskiego rzecznika konsumentów albo z polubownego ' +
						'rozwiązywania sporów — wykaz uprawnionych podmiotów prowadzi UOKiK.'
				),
			],
		},
		{
			heading: 'Odpowiedzialność',
			blocks: [
				p(
					'Odpowiadamy za niewykonanie lub nienależyte wykonanie usługi na zasadach ogólnych, ' +
						'a wobec konsumentów — zgodnie z przepisami o treściach cyfrowych. Nie odpowiadamy natomiast ' +
						'za skutki decyzji podjętych na podstawie treści serwisu, za poprawność danych dostawcy ' +
						'zewnętrznego ani za przerwy wynikające z awarii po stronie dostawców infrastruktury.'
				),
				p(
					'Zastrzegamy prawo do prac serwisowych i przerw technicznych, a także do zmiany lub wycofania ' +
						'pojedynczych funkcji. O zmianach istotnych dla planów płatnych informujemy z 14-dniowym ' +
						'wyprzedzeniem.'
				),
				p(
					'Wobec użytkowników niebędących konsumentami odpowiedzialność ogranicza się do kwoty ' +
						'zapłaconej w ciągu 12 miesięcy poprzedzających zdarzenie i nie obejmuje utraconych korzyści.'
				),
			],
		},
		{
			heading: 'Prawa autorskie',
			blocks: [
				p(
					'Serwis, jego układ, grafika i oprogramowanie są chronione prawem autorskim i należą do ' +
						'usługodawcy. Treści AI można wykorzystywać na własny użytek; ich masowe pobieranie ' +
						'i odsprzedaż są zabronione.'
				),
				p(
					'Nazwy drużyn, rozgrywek i zawodników służą wyłącznie identyfikacji opisywanych wydarzeń. ' +
						'Znaki towarowe należą do ich właścicieli — nie rościmy sobie do nich praw i nie sugerujemy ' +
						'powiązania. Nie prezentujemy herbów ani logotypów klubów.'
				),
				p(
					'Użytkownik zachowuje prawa do publikowanych przez siebie treści i udziela nam nieodpłatnej ' +
						'licencji na ich wyświetlanie w serwisie.'
				),
			],
		},
		{
			heading: 'Zmiany regulaminu i postanowienia końcowe',
			blocks: [
				p(
					'Regulamin możemy zmienić z ważnych przyczyn: zmiany zakresu usług, przepisów albo cennika. ' +
						'Informujemy o tym w serwisie z co najmniej 14-dniowym wyprzedzeniem. Brak akceptacji ' +
						'oznacza możliwość usunięcia konta; zmiana nie wpływa na już opłacone okresy i kupione kredyty.'
				),
				p(
					'Zasady przetwarzania danych opisuje Polityka prywatności. W sprawach nieuregulowanych stosuje ' +
						'się prawo polskie. Regulamin nie ogranicza praw konsumenta wynikających z przepisów ' +
						'bezwzględnie obowiązujących.'
				),
			],
		},
	],
};

const TERMS_EN = {
	title: 'Terms of Service',
	updatedLabel: 'In force since',
	intro:
		`These terms govern the use of ${OPERATOR.siteName} (${OPERATOR.url}). Creating an account ` +
		'means accepting them.',
	sections: [
		{
			heading: 'Who runs the service',
			blocks: [
				p(
					`${OPERATOR.name}, ${OPERATOR.address}, Poland. VAT ID ${OPERATOR.nip}, ` +
						`business register no. ${OPERATOR.regon}. Contact for everything — complaints, personal ` +
						`data, content reports: ${OPERATOR.email}.`
				),
			],
		},
		{
			heading: 'What the service offers',
			blocks: [
				ul([
					'live chat in rooms tied to individual matches, and private messages between users,',
					'statistical model picks next to matches in the fixture list — on the free plan only a mark that the ' +
						'model has a pick, on paid plans and during the trial also which pick and by how much — and the ' +
						'pick of the day, open to everyone,',
					'pre-match analyses generated by a language model from sports data, and on paid plans also analyses ' +
						'of matches in play (the trial does not include them),',
					'coupons, i.e. sets of a few model picks with total odds and the model’s chance: the coupon of the ' +
						'day for everyone, and the 3-day and 5-day coupons plus the live coupon (a coupon generator for ' +
						'matches in play) on paid plans and during the trial — without that access you see the total odds, ' +
						'the chance and the number of picks,',
					'summary reports highlighting selected fixtures in the coming days, including the “Higher odds” ' +
						'report with picks at higher odds and a lower chance,',
					'an AI assistant that answers questions about a specific match (under an analysis and after an @AI ' +
						'mention in a match chat) and about the whole schedule in the Assistant tab — fixtures, model picks, ' +
						'coupons, higher-odds picks and accuracy — with conversation history saved to the account; on paid ' +
						'plans it searches the web on request for team news (e.g. injuries, line-ups) and cites its sources,',
					'a morning email with the model’s picks for the day and the previous day’s results — on paid plans ' +
						'and during the trial, sent only if you switch it on yourself,',
					'your own picks with automatic settlement and accuracy statistics, plus public settlement of model ' +
						'picks, the pick of the day and coupons,',
					'a weekly round with a shared fixture set and a leaderboard,',
					'a list of favourite matches.',
				]),
				p(
					'You need a device with internet access and a browser supporting JavaScript and local ' +
						'storage. An e-mail address is required to create an account.'
				),
				p(
					'Sports data, including odds, comes from an external provider. We are not liable for its completeness or ' +
						'accuracy — in particular for delays in live results, fixture rescheduling, and errors in ' +
						'line-ups and statistics.'
				),
			],
		},
		{
			heading: 'What the service is not',
			blocks: [
				p(
					'Content is informational and statistical. It is not betting advice, an investment ' +
						'recommendation, or an encouragement to gamble.'
				),
				p(
					'We do not organise gambling or betting, do not accept stakes and do not pay out winnings. ' +
						'Picks exist for entertainment and for comparing accuracy, with no monetary prizes.'
				),
				p(
					'Odds shown with coupons and picks are the median of several bookmakers’ odds, shown as a measure of ' +
						'the market’s view of the chance — without bookmaker names and without links to them. A given ' +
						'bookmaker’s odds may differ. A coupon is a set of model picks, not a bet placed through the service.'
				),
				p(
					'Analyses, reports, assistant replies and summaries of web news are generated by a language model, ' +
						'and picks and coupons are selected by a statistical model — both may contain ' +
						'errors, including factual ones. Stated probabilities are model estimates, not verified ' +
						'values. Past results do not guarantee future ones. Content marked as AI-generated genuinely ' +
						'is — we do not edit it by hand.'
				),
				p(
					'Decisions based on this content are yours alone and at your own risk. The service is for ' +
						'adults only. Gambling can be addictive — free help in Poland: 801 889 880.'
				),
			],
		},
		{
			heading: 'Account and rules of use',
			blocks: [
				p(
					'Registration requires a username, e-mail address and password, or Google sign-in, plus ' +
						'confirmation of the e-mail address. Accounts are personal and must not be shared.'
				),
				p('Publishing unlawful content is prohibited, in particular content that is:'),
				ul([
					'vulgar, offensive, or inciting hatred or violence,',
					'infringing the rights of others, including personal rights and copyright,',
					'advertising betting, gambling or other services,',
					'misleading as to the identity of the author.',
				]),
				p(
					'Automated scraping, circumventing plan limits and creating accounts for that purpose are ' +
						'also prohibited.'
				),
				p(
					'In case of a breach we may remove content, restrict features or block the account — stating ' +
						'the reason and allowing an appeal through the complaints procedure. You may delete your ' +
						`account at any time by writing to ${OPERATOR.email}; we remove it with your content within ` +
						'14 days.'
				),
			],
		},
		{
			heading: 'Reporting illegal content',
			blocks: [
				p(
					`Anyone may report content believed to be illegal to ${OPERATOR.email}. A report should ` +
						'identify the content (ideally with a link), the reason, and contact details of the reporter.'
				),
				p(
					'We handle reports without undue delay and inform the reporter of the outcome. Authors of ' +
						'removed content are told why. Decisions can be appealed at the same address.'
				),
			],
		},
		{
			heading: 'Plans, credits and payments',
			blocks: [
				p(
					'There is a free plan and paid plans (Pro and VIP). They differ in limits on analyses, reports, ' +
						'assistant questions and news searches, and in access to the features described above. Current ' +
						`limits, prices and plan contents are on the "Plans and limits" page (${OPERATOR.url}/en/cennik) ` +
						'and form part of these terms.'
				),
				p(
					`The first ${TRIAL.days} days after creating an account are a trial. During it the account gets a ` +
						'one-off welcome allowance of analyses, assistant questions and reports — on top of the free-plan ' +
						'limits — plus model picks with numbers in the fixture list, the 3-day and 5-day coupons, the live ' +
						'coupon and the morning email. The trial does not include in-play analyses or web news search — ' +
						'those are on paid plans only. When it ends, any unused allowance lapses and the account stays on ' +
						'the free plan.'
				),
				p(
					`Paid-plan limits renew every ${PLAN_PASS_DAYS} days counted from the day of purchase; free-plan ` +
						'limits renew on the first day of each calendar month, except the free-plan limit on reading ' +
						'existing analyses, which is daily. Unused limits do not carry over.'
				),
				p(
					'Credit packs can be bought independently of a plan. A credit is spent only after the plan ' +
						`allowance runs out: an analysis costs ${CREDIT_COSTS.analysis} ` +
						`${CREDIT_COSTS.analysis === 1 ? 'credit' : 'credits'}, a report ${CREDIT_COSTS.report}; ` +
						'assistant questions and news searches never consume credits — they work only within the plan ' +
						'limit. Credits do not expire and cannot be exchanged for money. If a payment is refunded, the ' +
						'corresponding credits are deducted.'
				),
				p(
					`Paid plans are sold as timed access — ${PLAN_PASS_DAYS} days from purchase. The payment is one-off: nothing ` +
						'renews automatically and there is nothing to cancel. When the paid days run out the account ' +
						'returns to the free plan and a further period is bought separately. Buying before the current ' +
						'period ends adds days to those remaining, so nothing is lost.'
				),
				p(
					'Payments are handled by Stripe Payments Europe Ltd. We have no access to card details. ' +
						'Available methods are card, BLIK and Przelewy24.'
				),
				p(
					'Refunds and the right of withdrawal are covered by a separate document, "Refunds and right of ' +
						`withdrawal", available at ${OPERATOR.url}/en/zwroty. It forms part of these terms.`
				),
			],
		},
		{
			heading: 'Complaints',
			blocks: [
				p(
					`Complaints go to ${OPERATOR.email}. Your username, a description of the problem and the ` +
						'expected resolution are enough. We set no deadline for filing a complaint and no limit on ' +
						'what it may concern.'
				),
				p(
					'We reply within 14 days to the address the complaint came from. Consumers in Poland may also ' +
						'turn to a district or municipal consumer ombudsman, or to out-of-court dispute resolution — ' +
						'the register of authorised bodies is kept by UOKiK.'
				),
			],
		},
		{
			heading: 'Liability',
			blocks: [
				p(
					'We are liable for non-performance or improper performance on general terms, and towards ' +
						'consumers under the rules on digital content. We are not liable for the consequences of ' +
						'decisions made on the basis of the content, for the accuracy of third-party data, or for ' +
						'outages originating with infrastructure providers.'
				),
				p(
					'We reserve the right to maintenance windows and to changing or withdrawing individual ' +
						'features. Changes material to paid plans are announced 14 days in advance.'
				),
				p(
					'Towards users who are not consumers, liability is limited to the amount paid in the 12 months ' +
						'preceding the event and excludes lost profits.'
				),
			],
		},
		{
			heading: 'Intellectual property',
			blocks: [
				p(
					'The service, its layout, graphics and software are protected by copyright held by the ' +
						'operator. AI content may be used for personal purposes; bulk extraction and resale are ' +
						'prohibited.'
				),
				p(
					'Names of teams, competitions and players serve only to identify the events described. ' +
						'Trademarks belong to their owners — we claim no rights to them and imply no affiliation. ' +
						'We do not display club crests or logos.'
				),
				p(
					'You keep the rights to content you publish and grant us a free licence to display it within ' +
						'the service.'
				),
			],
		},
		{
			heading: 'Changes and final provisions',
			blocks: [
				p(
					'We may amend these terms for important reasons: a change in the scope of services, in the law, ' +
						'or in pricing. Changes are announced in the service at least 14 days in advance. If you do ' +
						'not accept them you may delete your account; changes do not affect periods already paid for ' +
						'or credits already bought.'
				),
				p(
					'Data processing is described in the Privacy Policy. Matters not covered here are governed by ' +
						'Polish law. These terms do not limit consumer rights arising from mandatory provisions.'
				),
			],
		},
	],
};

/* ── Polityka prywatności ──────────────────────────────────────────────────────── */

const COOKIE_TABLE_PL = {
	type: 'table',
	head: ['Nazwa', 'Rodzaj', 'Cel', 'Czas'],
	rows: [
		['accessToken', 'niezbędne', 'utrzymanie zalogowanej sesji', '30 minut'],
		['refreshToken', 'niezbędne', 'odnowienie sesji bez ponownego logowania', '30 dni'],
		['NEXT_LOCALE', 'niezbędne', 'zapamiętanie języka', 'do roku'],
		['czat-consent', 'niezbędne', 'zapamiętanie decyzji o zgodach', 'do wyczyszczenia'],
		['czat-age', 'niezbędne', 'zapamiętanie potwierdzenia pełnoletności', 'do wyczyszczenia'],
		['czat-theme', 'funkcjonalne', 'motyw jasny lub ciemny', 'do wyczyszczenia'],
		['czat-sound-enabled', 'funkcjonalne', 'dźwięk powiadomień', 'do wyczyszczenia'],
		['pliki Google', 'opcjonalne — za zgodą', 'logowanie kontem Google', 'wg zasad Google'],
		['_ga, _ga_*', 'opcjonalne — za zgodą', 'Google Analytics: rozróżnianie odwiedzających i sesji', 'do 2 lat'],
	],
};

const COOKIE_TABLE_EN = {
	type: 'table',
	head: ['Name', 'Category', 'Purpose', 'Retention'],
	rows: [
		['accessToken', 'necessary', 'keeping the session signed in', '30 minutes'],
		['refreshToken', 'necessary', 'renewing the session', '30 days'],
		['NEXT_LOCALE', 'necessary', 'remembering the language', 'up to a year'],
		['czat-consent', 'necessary', 'remembering consent choices', 'until cleared'],
		['czat-age', 'necessary', 'remembering the age confirmation', 'until cleared'],
		['czat-theme', 'functional', 'light or dark theme', 'until cleared'],
		['czat-sound-enabled', 'functional', 'notification sound', 'until cleared'],
		['Google cookies', 'optional — with consent', 'Google sign-in', 'per Google policies'],
		['_ga, _ga_*', 'optional — with consent', 'Google Analytics: telling visitors and sessions apart', 'up to 2 years'],
	],
};

const PRIVACY_PL = {
	title: 'Polityka prywatności',
	updatedLabel: 'Aktualizacja',
	intro: 'Jakie dane zbieramy, po co, komu je powierzamy i co możesz z tym zrobić.',
	sections: [
		{
			heading: 'Administrator',
			blocks: [
				p(
					`${OPERATOR.name}, ${OPERATOR.address}, NIP ${OPERATOR.nip}. Sprawy dotyczące danych: ` +
						`${OPERATOR.email}. Nie powołaliśmy inspektora ochrony danych — zakres przetwarzania tego ` +
						'nie wymaga.'
				),
			],
		},
		{
			heading: 'Jakie dane i na jakiej podstawie',
			blocks: [
				ul([
					'Konto: nazwa użytkownika, adres e-mail, zaszyfrowane hasło, data rejestracji i akceptacji regulaminu — art. 6 ust. 1 lit. b RODO (umowa).',
					'Logowanie Google, jeśli z niego korzystasz: identyfikator konta, adres e-mail i nazwa — art. 6 ust. 1 lit. a RODO (zgoda).',
					'Statystyki odwiedzin w Google Analytics, wyłącznie po Twojej zgodzie: odwiedzane strony, czas, przybliżona lokalizacja z adresu IP, rodzaj urządzenia i przeglądarki. Adres IP jest skracany przez Google przed zapisem, a dane nie są łączone z Twoim kontem — art. 6 ust. 1 lit. a RODO (zgoda).',
					'Treści: wiadomości na czacie i prywatne, typy z komentarzami, ulubione mecze oraz rozmowy z asystentem AI — art. 6 ust. 1 lit. b RODO.',
					'Poranny mail, jeśli go włączysz: adres e-mail konta, wybrany język maila, data włączenia i ostatniej wysyłki oraz losowy token, który pozwala wyłączyć mail jednym kliknięciem bez logowania. Treść maila składamy z typów modelu oraz Twoich typów, ulubionych meczów i wyniku w kolejce — art. 6 ust. 1 lit. a RODO (zgoda, którą wycofujesz, wyłączając mail w panelu konta albo odnośnikiem w mailu).',
					'Zużycie planu i koszt wygenerowanych treści — art. 6 ust. 1 lit. b i f RODO (rozliczenie limitów, przeciwdziałanie nadużyciom).',
					'Adres IP i dane przeglądarki w logach serwera — art. 6 ust. 1 lit. f RODO (bezpieczeństwo).',
					'Płatności: identyfikator klienta i status u operatora, dokumenty księgowe — art. 6 ust. 1 lit. b i c RODO. Numerów kart nie widzimy.',
				]),
				p(
					'Podanie danych jest dobrowolne, ale bez nich nie da się założyć konta ani korzystać z funkcji ' +
						'wymagających zalogowania.'
				),
			],
		},
		{
			heading: 'Co trafia do modeli językowych',
			blocks: [
				p(
					'Wygenerowanie analizy, raportu lub kuponu wysyła do dostawcy modelu wyłącznie dane sportowe ' +
						'o meczach — bez danych osobowych.'
				),
				p(
					'Asystent działa inaczej. Pytanie zadane pod analizą, w zakładce Asystent albo — w czacie meczowym — ' +
						'wzmianką @AI przesyła do dostawcy modelu treść pytania razem z ostatnimi wiadomościami tej samej ' +
						'rozmowy, a w przypadku czatu meczowego fragment historii rozmowy w tym pokoju wraz z nazwami ' +
						'piszących. Asystent w zakładce Asystent, gdy pytanie tego wymaga, przekazuje modelowi także dane ' +
						'z Twojego konta potrzebne do odpowiedzi — np. ulubione mecze, własne typy i ich skuteczność, ' +
						'ostatnie raporty, plan i stan limitów. Adresu e-mail ani danych logowania nie przekazujemy. ' +
						'Nie umieszczaj w pytaniach danych, których nie chcesz przekazywać poza serwis.'
				),
				p(
					'Wyszukiwanie wiadomości w internecie (plany płatne) wykonuje dostawca modelu własnym narzędziem ' +
						'wyszukiwania. Trafia do niego wyłącznie zapytanie ułożone przez asystenta na podstawie Twojego ' +
						'pytania — np. nazwa drużyny i temat — bez danych konta.'
				),
				p(
					'Rozmowy z asystentem zapisujemy na Twoim koncie, żeby można było do nich wrócić; widzisz je tylko ' +
						'Ty. W zakładce Asystent przechowujemy najwyżej 50 rozmów — gdy zaczynasz kolejną, najdawniej ' +
						'używane usuwamy automatycznie — a każdą możesz w każdej chwili usunąć sam. Rozmowa pod analizą meczu znika ' +
						'automatycznie 30 dni po ostatnim pytaniu. Wyjątkiem jest @AI w czacie meczowym: pytanie i odpowiedź ' +
						'są tam częścią publicznej rozmowy w pokoju, jak każda inna wiadomość.'
				),
				p(
					'Dostawcami są Anthropic PBC i OpenAI, L.L.C. (USA) — jeden obsługuje zapytania na co dzień, ' +
						'drugi przejmuje je, gdy pierwszy jest niedostępny. Korzystamy z warunków dla klientów ' +
						'biznesowych, w których dostawcy zobowiązują się nie wykorzystywać przekazanych treści do ' +
						'trenowania modeli.'
				),
			],
		},
		{
			heading: 'Komu powierzamy dane',
			blocks: [
				ul([
					'MongoDB, Inc. — baza danych,',
					'dostawca serwera aplikacji i pamięci podręcznej Redis,',
					'Anthropic PBC i OpenAI, L.L.C. — generowanie treści AI, odpowiedzi asystenta i wyszukiwanie wiadomości w internecie,',
					'Google Ireland Ltd. — logowanie kontem Google oraz Google Analytics, jedno i drugie wyłącznie za zgodą,',
					'dostawca poczty wychodzącej — potwierdzenia adresu, reset hasła, mail powitalny po założeniu konta i poranny mail,',
					'Stripe Payments Europe Ltd. — obsługa płatności,',
					'biuro rachunkowe — dokumenty księgowe.',
				]),
				p(
					'Dostawca danych sportowych nie otrzymuje od nas żadnych danych użytkowników — to my pobieramy ' +
						'od niego dane o meczach. Część odbiorców ma siedzibę poza EOG; przekazanie opiera się na ' +
						'standardowych klauzulach umownych zatwierdzonych przez Komisję Europejską.'
				),
			],
		},
		{
			heading: 'Jak długo przechowujemy',
			blocks: [
				ul([
					'Dane konta i treści — do usunięcia konta; analizy meczów na żywo kasują się automatycznie po kilkunastu minutach.',
					'Rozmowy z asystentem w zakładce Asystent — do czasu, aż je usuniesz albo usuniesz konto, najwyżej 50 rozmów; rozmowy pod analizą meczu — 30 dni od ostatniego pytania.',
					'Ustawienia porannego maila, w tym token do wypisania — do usunięcia konta; po wyłączeniu maila nie wysyłamy go więcej.',
					'Liczniki zużycia — do końca okresu rozliczeniowego, którego dotyczą.',
					'Logi serwera — do 30 dni.',
					'Księga kredytów i dokumenty księgowe — 5 lat, zgodnie z przepisami podatkowymi.',
				]),
			],
		},
		{
			heading: 'Twoje prawa',
			blocks: [
				p(
					'Masz prawo dostępu do danych, sprostowania, usunięcia, ograniczenia przetwarzania, ' +
						'przenoszenia oraz sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie. Zgody ' +
						'możesz wycofać w każdej chwili — nie wpływa to na legalność wcześniejszego przetwarzania.'
				),
				p(
					`Żądania kieruj na ${OPERATOR.email}. Przysługuje Ci też skarga do Prezesa Urzędu Ochrony ` +
						'Danych Osobowych.'
				),
			],
		},
		{
			heading: 'Ciasteczka i pamięć lokalna',
			blocks: [
				p(
					'Ruch na stronie mierzymy Google Analytics — wyłącznie po Twojej zgodzie z banera; bez niej skrypt ' +
						'w ogóle nie jest ładowany. Reklam nie ma i nie profilujemy użytkowników w celach marketingowych. ' +
						'Poniższa lista jest kompletna. Zgody opcjonalne zmienisz odnośnikiem w stopce.'
				),
				COOKIE_TABLE_PL,
			],
		},
		{
			heading: 'Decyzje automatyczne',
			blocks: [
				p(
					'Nie podejmujemy decyzji opartych wyłącznie na automatycznym przetwarzaniu, które wywoływałyby ' +
						'wobec Ciebie skutki prawne. Treści modelu dotyczą wydarzeń sportowych, nie oceny osoby.'
				),
			],
		},
	],
};

const PRIVACY_EN = {
	title: 'Privacy Policy',
	updatedLabel: 'Updated',
	intro: 'What we collect, why, who processes it for us, and what you can do about it.',
	sections: [
		{
			heading: 'Controller',
			blocks: [
				p(
					`${OPERATOR.name}, ${OPERATOR.address}, Poland. VAT ID ${OPERATOR.nip}. Data enquiries: ` +
						`${OPERATOR.email}. No data protection officer has been appointed; the scope of processing ` +
						'does not require one.'
				),
			],
		},
		{
			heading: 'What data and on what basis',
			blocks: [
				ul([
					'Account: username, e-mail, hashed password, registration date and terms acceptance — Art. 6(1)(b) GDPR (contract).',
					'Google sign-in, if used: account identifier, e-mail and name — Art. 6(1)(a) GDPR (consent).',
					'Visit statistics in Google Analytics, only with your consent: pages visited, time spent, approximate location derived from the IP address, device and browser type. Google truncates the IP address before storage and the data is not linked to your account — Art. 6(1)(a) GDPR (consent).',
					'Content: chat and private messages, picks with comments, favourite matches and conversations with the AI assistant — Art. 6(1)(b) GDPR.',
					'The morning email, if you switch it on: the account e-mail address, the chosen email language, the dates it was switched on and last sent, and a random token that lets you switch it off in one click without signing in. The email is built from the model’s picks and from your picks, favourite matches and round standing — Art. 6(1)(a) GDPR (consent, which you withdraw by switching the email off in your account panel or via the link in the email).',
					'Plan usage and the cost of generated content — Art. 6(1)(b) and (f) GDPR (limits, abuse prevention).',
					'IP address and browser data in server logs — Art. 6(1)(f) GDPR (security).',
					'Payments: customer identifier and status held by the provider, accounting records — Art. 6(1)(b) and (c) GDPR. We never see card numbers.',
				]),
				p(
					'Providing data is voluntary, but without it you cannot create an account or use features that ' +
						'require signing in.'
				),
			],
		},
		{
			heading: 'What reaches language model providers',
			blocks: [
				p(
					'Generating an analysis, report or coupon sends only sports data about the matches — no personal data.'
				),
				p(
					'The assistant is different. A question asked under an analysis, in the Assistant tab or — in a ' +
						'match chat — with an @AI mention sends the question to the model provider together with the latest ' +
						'messages of the same conversation, and for a match chat a fragment of that room’s history including ' +
						'the authors’ usernames. When a question calls for it, the assistant in the Assistant tab also passes ' +
						'on data from your account needed for the answer — e.g. favourite matches, your own picks and their ' +
						'accuracy, recent reports, your plan and remaining limits. We never pass on your e-mail address or ' +
						'sign-in details. Do not put anything in a question you would not want leaving the service.'
				),
				p(
					'Web news search (paid plans) is carried out by the model provider with its own search tool. It ' +
						'receives only a query the assistant composes from your question — e.g. a team name and a topic — ' +
						'with no account data.'
				),
				p(
					'Assistant conversations are saved to your account so you can return to them; only you can see ' +
						'them. In the Assistant tab we keep at most 50 conversations — when you start another, the least ' +
						'recently used are deleted automatically — and you can delete any of them yourself at any time. A ' +
						'conversation under a match analysis is deleted automatically 30 days after the last question. The ' +
						'exception is @AI in a match chat: the question and answer are part of the public room conversation, ' +
						'like any other message.'
				),
				p(
					'The providers are Anthropic PBC and OpenAI, L.L.C. (USA) — one handles requests day to day, the ' +
						'other takes over when the first is unavailable. We use their business terms, under ' +
						'which they undertake not to train models on submitted content.'
				),
			],
		},
		{
			heading: 'Who processes data for us',
			blocks: [
				ul([
					'MongoDB, Inc. — database,',
					'the provider hosting the application and the Redis cache,',
					'Anthropic PBC and OpenAI, L.L.C. — AI content generation, assistant replies and web news search,',
					'Google Ireland Ltd. — Google sign-in and Google Analytics, both with consent only,',
					'the outgoing mail provider — address confirmation, password resets, the welcome email after sign-up and the morning email,',
					'Stripe Payments Europe Ltd. — payments,',
					'our accounting office — accounting records.',
				]),
				p(
					'The sports data provider receives no user data from us; we only fetch match data. Some ' +
						'recipients are established outside the EEA; transfers rely on standard contractual clauses ' +
						'approved by the European Commission.'
				),
			],
		},
		{
			heading: 'Retention',
			blocks: [
				ul([
					'Account data and content — until the account is deleted; in-play analyses are removed automatically after several minutes.',
					'Assistant conversations in the Assistant tab — until you delete them or the account, at most 50 conversations; conversations under a match analysis — 30 days from the last question.',
					'Morning email settings, including the unsubscribe token — until the account is deleted; once the email is switched off we no longer send it.',
					'Usage counters — until the end of the billing period concerned.',
					'Server logs — up to 30 days.',
					'Credit ledger and accounting records — 5 years, as required by tax law.',
				]),
			],
		},
		{
			heading: 'Your rights',
			blocks: [
				p(
					'You may access, rectify, erase, restrict and port your data, and object to processing based ' +
						'on legitimate interest. Consents can be withdrawn at any time without affecting the ' +
						'lawfulness of earlier processing.'
				),
				p(
					`Send requests to ${OPERATOR.email}. You may also lodge a complaint with the Polish data ` +
						'protection authority (Prezes UODO).'
				),
			],
		},
		{
			heading: 'Cookies and local storage',
			blocks: [
				p(
					'We measure site traffic with Google Analytics — only after your consent in the banner; without it ' +
						'the script is not loaded at all. There is no advertising and we do not profile users for marketing. ' +
						'The list below is complete. Optional consents can be changed from the link in the footer.'
				),
				COOKIE_TABLE_EN,
			],
		},
		{
			heading: 'Automated decisions',
			blocks: [
				p(
					'We make no decisions based solely on automated processing that would produce legal effects ' +
						'for you. Model output concerns sporting events, not any assessment of you.'
				),
			],
		},
	],
};

/* ── Zwroty i odstąpienie od umowy ─────────────────────────────────────────────── */

/**
 * Osobny dokument, a nie paragraf w regulaminie — z dwóch powodów.
 *
 * Praktycznego: Stripe przy weryfikacji konta szuka na stronie odrębnych, nazwanych zasad
 * zwrotów; akapit ukryty w § o płatnościach nie przechodzi tego sprawdzenia. I obowiązku
 * informacyjnego: to jest ta część umowy, którą konsument czyta wtedy, gdy coś poszło nie
 * tak, więc ma być do znalezienia w jednym kliknięciu ze stopki, bez czytania całości.
 */

const REFUNDS_PL = {
	title: 'Zwroty i odstąpienie od umowy',
	updatedLabel: 'Obowiązuje od',
	intro:
		`Dokument stanowi część regulaminu serwisu ${OPERATOR.siteName} i opisuje, kiedy przysługuje ` +
		'zwrot pieniędzy, jak go uzyskać i co dzieje się wtedy z kredytami oraz opłaconym dostępem.',
	sections: [
		{
			heading: 'Co dokładnie kupujesz',
			blocks: [
				p(
					'Sprzedajemy treści cyfrowe: pakiety kredytów na analizy meczów i raporty AI oraz dostęp do ' +
						'planu płatnego na 30 dni. Każdy zakup jest płatnością jednorazową — nic nie odnawia się ' +
						'automatycznie i nie ma umowy, którą trzeba by wypowiadać.'
				),
				p(
					'Świadczenie rozpoczyna się natychmiast po zaksięgowaniu płatności: kredyty pojawiają się na ' +
						'koncie, a dostęp do planu zaczyna biec od tej chwili.'
				),
			],
		},
		{
			heading: 'Prawo odstąpienia i oświadczenie przy zakupie',
			blocks: [
				p(
					'Konsumentowi przysługuje prawo odstąpienia od umowy w terminie 14 dni bez podania przyczyny. ' +
						'Przy treściach cyfrowych dostarczanych natychmiast prawo to wygasa, jeżeli konsument wyraźnie ' +
						'zażądał rozpoczęcia świadczenia przed upływem tego terminu i przyjął do wiadomości utratę ' +
						'prawa odstąpienia (art. 38 pkt 13 ustawy o prawach konsumenta).'
				),
				p(
					'Dlatego przed każdą płatnością prosimy o zaznaczenie osobnego oświadczenia o tej treści. ' +
						'Bez niego płatność nie zostanie rozpoczęta. Treść oświadczenia, datę i wersję regulaminu ' +
						'zapisujemy przy koncie — na żądanie wysyłamy je na adres e-mail przypisany do konta.'
				),
			],
		},
		{
			heading: 'Kiedy zwracamy pieniądze',
			blocks: [
				ul([
					'Niewykorzystane kredyty — zwrot w całości na żądanie złożone w ciągu 14 dni od zakupu.',
					'Kredyty zużyte częściowo — zwracamy kwotę odpowiadającą części niewykorzystanej.',
					'Dostęp do planu — zwrot proporcjonalny do niewykorzystanych dni, jeżeli żądanie wpłynie ' +
						'w ciągu 14 dni od zakupu.',
					'Usługa, której nie dostarczyliśmy z naszej winy (awaria, błąd w naliczeniu limitu, ' +
						'nieudane wygenerowanie analizy mimo pobrania kredytu) — zwrot w całości, bez ograniczenia ' +
						'terminem i niezależnie od złożonego oświadczenia.',
				]),
				p(
					'Zwrotu nie obejmuje sam fakt, że treść analizy okazała się nietrafiona. Serwis dostarcza ' +
						'analizę, a nie wynik meczu — patrz „Czym serwis nie jest" w regulaminie.'
				),
			],
		},
		{
			heading: 'Jak zgłosić zwrot',
			blocks: [
				p(
					`Napisz na ${OPERATOR.email} z adresu przypisanego do konta. Wystarczy nazwa użytkownika ` +
						'i informacja, czego dotyczy zgłoszenie. Nie wymagamy żadnego formularza ani uzasadnienia.'
				),
				p(
					'Odpowiadamy w ciągu 14 dni. Pieniądze zwracamy tą samą metodą, którą wpłynęła płatność — ' +
						'kartą, BLIK-iem albo przelewem przez Przelewy24; zwrot realizuje Stripe. Zaksięgowanie po ' +
						'stronie banku trwa zwykle od jednego do pięciu dni roboczych i nie zależy od nas.'
				),
				p(
					'Wraz ze zwrotem płatności odejmujemy z konta odpowiadającą jej liczbę kredytów, a przy planie ' +
						'skracamy dostęp o opłacony okres. Dzieje się to automatycznie, w chwili gdy Stripe potwierdzi ' +
						'zwrot — nie trzeba o tym osobno informować.'
				),
			],
		},
		{
			heading: 'Reklamacje',
			blocks: [
				p(
					'Prawo do reklamacji przysługuje niezależnie od prawa odstąpienia i nie wygasa wraz z nim. ' +
						`Tryb opisuje regulamin: zgłoszenie na ${OPERATOR.email}, odpowiedź w ciągu 14 dni. ` +
						'Konsument może też skorzystać z pomocy powiatowego lub miejskiego rzecznika konsumentów.'
				),
			],
		},
	],
};

const REFUNDS_EN = {
	title: 'Refunds and right of withdrawal',
	updatedLabel: 'In force since',
	intro:
		`This document forms part of the ${OPERATOR.siteName} terms and explains when a refund is due, ` +
		'how to request one, and what then happens to credits and paid access.',
	sections: [
		{
			heading: 'What you are buying',
			blocks: [
				p(
					'We sell digital content: credit packs for match analyses and AI reports, and 30-day access to ' +
						'a paid plan. Every purchase is a one-off payment — nothing renews automatically and there is ' +
						'no contract to cancel.'
				),
				p(
					'Performance begins as soon as the payment clears: credits appear on the account and plan access ' +
						'starts running from that moment.'
				),
			],
		},
		{
			heading: 'Right of withdrawal and the declaration at purchase',
			blocks: [
				p(
					'Consumers may withdraw from the contract within 14 days without giving a reason. For digital ' +
						'content delivered immediately this right lapses where the consumer expressly requested that ' +
						'performance begin before that period ended and acknowledged losing the right (art. 38(13) of ' +
						'the Polish Consumer Rights Act).'
				),
				p(
					'That is why we ask for a separate declaration to that effect before every payment. Without it ' +
						'the payment is not started. We store the wording, the date and the terms version with the ' +
						'account, and send them to the account e-mail on request.'
				),
			],
		},
		{
			heading: 'When we refund',
			blocks: [
				ul([
					'Unused credits — refunded in full on request made within 14 days of purchase.',
					'Partly used credits — we refund the amount matching the unused part.',
					'Plan access — refunded pro rata for the unused days, if the request arrives within 14 days ' +
						'of purchase.',
					'A service we failed to deliver through our own fault (an outage, a wrongly counted allowance, ' +
						'an analysis that did not generate although a credit was taken) — refunded in full, with no ' +
						'time limit and regardless of the declaration given.',
				]),
				p(
					'A refund is not due merely because an analysis turned out to be wrong. The service delivers an ' +
						'analysis, not a match result — see "What the service is not" in the terms.'
				),
			],
		},
		{
			heading: 'How to request a refund',
			blocks: [
				p(
					`Write to ${OPERATOR.email} from the address linked to the account. Your username and what the ` +
						'request concerns are enough. No form and no justification are required.'
				),
				p(
					'We reply within 14 days. Money goes back by the same method it arrived — card, BLIK or a ' +
						'Przelewy24 transfer; Stripe carries out the refund. Crediting on the bank side usually takes ' +
						'one to five working days and is outside our control.'
				),
				p(
					'Along with the refund we deduct the matching number of credits from the account, and for a plan ' +
						'we shorten access by the period paid for. This happens automatically the moment Stripe ' +
						'confirms the refund — there is nothing extra to report.'
				),
			],
		},
		{
			heading: 'Complaints',
			blocks: [
				p(
					'The right to complain is independent of the right of withdrawal and does not lapse with it. ' +
						`The procedure is in the terms: write to ${OPERATOR.email}, we reply within 14 days. ` +
						'Consumers in Poland may also turn to a district or municipal consumer ombudsman.'
				),
			],
		},
	],
};

export const TERMS = { pl: TERMS_PL, en: TERMS_EN };
export const PRIVACY = { pl: PRIVACY_PL, en: PRIVACY_EN };
export const REFUNDS = { pl: REFUNDS_PL, en: REFUNDS_EN };

/** Zwraca dokument w danym języku; nieznany język dostaje wersję polską. */
export function documentFor(collection, locale) {
	return collection[locale] || collection.pl;
}
