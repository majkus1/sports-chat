/**
 * Wspólna powłoka HTML dla stron z widgetami API-Sports ładowanymi w iframe.
 *
 * Klucz pochodzi z `process.env.API_SPORTS_KEY` zamiast być wpisany w plik w `public/`.
 * Uwaga: widget API-Sports działa w przeglądarce, więc klucz i tak trafia do DOM-u
 * i jest widoczny w DevTools — tego nie da się ukryć bez rezygnacji z widgetów.
 * Zysk jest inny: klucz nie leży w repozytorium, da się go zmienić bez deployu kodu
 * i można użyć osobnego klucza ograniczonego do domeny.
 *
 * Strona działa w dwóch trybach:
 *  - samodzielnym — pełnoekranowe okno otwierane z listy meczów (jak dotąd),
 *  - osadzonym (`embed`) — zakładka w pokoju meczowym, bez własnego tła i marginesów,
 *    z wysokością raportowaną do rodzica, żeby nie powstał pasek przewijania w pasku.
 */

const WIDGET_SCRIPT = 'https://widgets.api-sports.io/3.1.0/widgets.js';

/**
 * Motyw, warianty i reguły ukrywania herbów — identyczne na wszystkich stronach widgetów.
 * Tryb i motyw sterowane są klasami na `<html>`, dzięki czemu jeden arkusz obsługuje
 * wszystkie kombinacje, a przełączenie motywu nie wymaga przeładowania iframe'a.
 */
const SHARED_STYLES = `
        :root { color-scheme: light; }
        html.dark { color-scheme: dark; }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: 100%;
            min-height: 100vh;
            overflow: auto;
            background-color: #f1f1f1;
            font-family: 'Roboto Condensed', sans-serif;
        }
        html.dark body { background-color: #0b1114; }

        .widget-wrapper {
            max-width: 1100px;
            margin: 60px auto 0 auto;
            padding: 20px;
            width: 100%;
        }
        .widget-card {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        html.dark .widget-card {
            background: #111a1e;
            border: 1px solid #24343b;
            box-shadow: none;
        }
        .widget-title {
            margin-bottom: 15px;
            font-size: 22px;
            font-weight: 700;
            color: #333;
            font-family: 'Roboto Condensed', sans-serif;
        }
        html.dark .widget-title { color: #e8eef0; }

        /*
         * Tryb osadzony: kartę rysuje już aplikacja dookoła iframe'a, więc strona widgetu
         * musi być przezroczysta i pozbawiona własnych marginesów. Nagłówek też znika —
         * zakładka nad iframe'em nazywa to samo drugi raz.
         */
        html.embed body { min-height: 0; overflow: visible; background: transparent; }
        html.embed .widget-wrapper { max-width: none; margin: 0; padding: 0; }
        html.embed .widget-card {
            background: transparent;
            border: 0;
            box-shadow: none;
            padding: 0;
            border-radius: 0;
        }
        html.embed .widget-title { display: none; }

        api-sports-widget[data-theme="CzatSportowy"] {
            --primary-color: #173b45;
            --success-color: #2ecc58;
            --warning-color: #f39c12;
            --danger-color: #e74c3c;
            --light-color: #898989;
            --home-color: var(--primary-color);
            --away-color: #ffc107;
            --text-color: #333;
            --text-color-info: #333;
            --background-color: #fff;
            --primary-font-size: 0.72rem;
            --secondary-font-size: 0.75rem;
            --button-font-size: 0.8rem;
            --title-font-size: 0.9rem;
            --header-text-transform: uppercase;
            --button-text-transform: uppercase;
            --title-text-transform: uppercase;
            --border: 1px solid #95959530;
            --game-height: 2.3rem;
            --league-height: 2.35rem;
            --score-size: 2.25rem;
            --flag-size: 22px;
            --teams-logo-size: 18px;
            --teams-logo-size-xl: 5rem;
            --hover: rgba(23, 59, 69, 0.15);
        }
        /* Wartości odpowiadają tokenom ciemnego motywu aplikacji z app/globals.css. */
        html.dark api-sports-widget[data-theme="CzatSportowy"] {
            --primary-color: #2a6a7c;
            --success-color: #22c55e;
            --light-color: #93a4ab;
            --text-color: #e8eef0;
            --text-color-info: #93a4ab;
            --background-color: #111a1e;
            --border: 1px solid #24343b;
            --hover: rgba(42, 106, 124, 0.28);
        }
        /*
         * Uwaga: zmienna tła widgetu celowo NIE jest tu ustawiana na przezroczystą.
         * Widget maluje tym kolorem nie tylko tła, ale i napis na aktywnej zakładce
         * (tekst bierze kolor tła na ciemnym wypełnieniu koloru wiodącego), więc
         * przezroczysta wartość gasiła ten napis. Wartości domyślne — biel w motywie
         * jasnym i 111a1e w ciemnym — i tak odpowiadają kolorowi karty, na której leży
         * iframe, więc widget wtapia się w otoczenie. Za przezroczystość odpowiada
         * reguła widget-card w trybie osadzonym, wyżej w tym arkuszu.
         */
        api-sports-widget[data-theme="CzatSportowy"] * {
            font-family: 'Roboto Condensed', sans-serif !important;
        }

        /*
         * Etykiety przełączników wewnątrz widgetu w motywie ciemnym.
         *
         * Widget liczy ich kolor ze swoich zmiennych: nieaktywne biorą kolor wiodący
         * (ciemna morska zieleń), a aktywna kolor tła. Oba wyliczenia są robione pod jasny
         * motyw i na ciemnym tle dają napisy o za małym kontraście. Widget renderuje się
         * w zwykłym drzewie DOM, nie w shadow DOM, więc możemy je po prostu nadpisać.
         * Rozróżnienie stanu niesie wypełnione tło aktywnego przycisku, nie sam kolor liter.
         *
         * Wymuszenie jest tu konieczne: arkusz dostawcy ma dla stanu aktywnego selektor
         * o wyższej specyficzności i bez tego wygrywał. To ten sam powód, dla którego
         * wymuszany jest wyżej krój pisma.
         */
        html.dark .btn-widget {
            color: #e8eef0 !important;
        }
        html.dark .btn-widget.active {
            color: #ffffff !important;
        }
        /* Ikony przy etykietach dziedziczą kolor tylko wtedy, gdy same go nie ustawiają. */
        html.dark .btn-widget svg {
            color: inherit;
            fill: currentColor;
        }
        @media (max-width: 768px) {
            .widget-wrapper { padding: 10px; }
            html.embed .widget-wrapper { padding: 0; }
            .widget-title { font-size: 19px; }
        }
        /* Ukryj wszystkie logo drużyn */
        .team-logo,
        img[src*="logo"], img[src*="badge"], img[src*="team"],
        img[alt*="logo"], img[alt*="badge"], img[alt*="team"],
        [class*="team-logo"], [class*="badge"], [class*="logo"],
        [data-logo], [data-badge], [data-team-logo],
        api-sports-widget img[src*="logo"],
        api-sports-widget img[src*="badge"],
        api-sports-widget img[src*="team"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
        }`;

/**
 * Klucz przeznaczony DO PRZEGLĄDARKI — inny niż klucz serwerowy.
 *
 * Widgety API-Sports działają po stronie klienta i z założenia noszą klucz w kodzie strony:
 * każdy, kto otworzy podgląd źródła, może go odczytać. Dostawca nie wydaje osobnych kluczy
 * publicznych, więc jedyną realną ochroną jest ograniczenie klucza do domeny i adresu IP
 * serwera w panelu API-Sports — wtedy wykradziony klucz jest bezużyteczny gdzie indziej.
 *
 * ŚWIADOMIE NIE MA TU POWROTU do `API_SPORTS_KEY`. Wcześniej klucz serwerowy trafiał wprost
 * do publicznego HTML-a pięciu tras, dostępnych bez logowania — czyli sekret używany do
 * wszystkich zapytań backendu wyciekał do każdego odwiedzającego. Gdy zmienna nie jest
 * ustawiona, widget się nie renderuje. Brak widgetu jest kłopotem; wyciek klucza jest awarią.
 */
function widgetKey() {
	const key = (process.env.API_SPORTS_WIDGET_KEY || '').trim();
	if (!key && process.env.NODE_ENV !== 'production') {
		console.warn('[widgets] brak API_SPORTS_WIDGET_KEY — widgety nie zostaną wyrenderowane');
	}
	return key;
}

/** Widoczny komunikat zamiast cichej pustki, gdy klucza publicznego brak. */
const MISSING_KEY_NOTICE = `<p style="padding:16px;text-align:center;color:#5c6b70;font-size:14px">
        Widget niedostępny — brak konfiguracji klucza publicznego (API_SPORTS_WIDGET_KEY).
    </p>`;

/** Widget `config` musi być ostatni i tylko raz na stronę. */
function configWidget(apiKey) {
	return `<api-sports-widget
        id="config-widget"
        data-type="config"
        data-sport="football"
        data-key="${escapeAttr(apiKey)}"
        data-lang="custom"
        data-theme="CzatSportowy"
        data-show-error="true"
        data-show-logos="false"
        data-refresh="20"
        data-player-trophies="true"
        data-standings="true"
        data-player-injuries="true"
        data-team-squad="true"
        data-team-statistics="true"
        data-tab="games"
        data-player-statistics="true"
        data-game-tab="statistics"
    ></api-sports-widget>`;
}

/** Plik z tłumaczeniami widgetu wybierany po locale (pliki zostają w `public/`). */
const CUSTOM_LANG_SCRIPT = `
    (function () {
        var params = new URLSearchParams(window.location.search);
        var locale = params.get('locale') === 'pl' ? 'pl' : 'en';
        var config = document.getElementById('config-widget');
        if (config) {
            config.setAttribute('data-custom-lang', window.location.origin + '/' + locale + '-football-widget.json');
        }
    })();`;

/**
 * Komunikacja z rodzicem w trybie osadzonym.
 *
 * Wysokość: widget dociąga dane po załadowaniu strony, więc treść rośnie już po `load`.
 * Bez raportowania rodzic musiałby zgadywać wysokość iframe'a i skończyłoby się paskiem
 * przewijania wewnątrz panelu. `ResizeObserver` łapie każdą zmianę, także zwijanie sekcji
 * przez użytkownika.
 *
 * `hasContent` mówi rodzicowi, kiedy zdjąć szkielet ładowania. Samo `load` nie wystarczy:
 * dokument jest gotowy po ułamku sekundy, a widget wypełnia się danymi kilka sekund
 * później — użytkownik patrzyłby przez ten czas na pustą ramkę.
 *
 * Za „treść" uznajemy też sam kontener widgetu, jeszcze bez danych. Widget ma własny
 * wskaźnik ładowania, więc od tego momentu jest co pokazywać, a nasz szkielet przestaje
 * być potrzebny. Bez tego zapytanie, które długo wisi po stronie dostawcy, trzymałoby
 * szkielet aż do zadziałania zabezpieczenia czasowego.
 *
 * Motyw: przełącznik w aplikacji nie może przeładowywać iframe'a, bo to ponowne odpytanie
 * API-Sports. Rodzic przysyła nazwę motywu, a tutaj zmienia się tylko klasa na `<html>`.
 */
const EMBED_BRIDGE_SCRIPT = `
    (function () {
        if (window.parent === window) return;
        var origin = window.location.origin;
        var lastHeight = 0;
        var lastHasContent = null;

        function report() {
            var height = Math.ceil(document.documentElement.scrollHeight);
            var hasContent =
                (document.body.innerText || '').trim().length > 0 ||
                !!document.querySelector('api-sports-widget .widget-container');
            if (height === lastHeight && hasContent === lastHasContent) return;
            lastHeight = height;
            lastHasContent = hasContent;
            window.parent.postMessage(
                { type: 'apiSportsWidgetHeight', height: height, hasContent: hasContent },
                origin
            );
        }

        window.addEventListener('message', function (event) {
            if (event.origin !== origin || !event.data) return;
            if (event.data.type !== 'apiSportsWidgetTheme') return;
            document.documentElement.classList.toggle('dark', event.data.theme === 'dark');
            report();
        });

        if (window.ResizeObserver) {
            new ResizeObserver(report).observe(document.documentElement);
        }
        window.addEventListener('load', report);

        // Domknięcie na wypadek treści, która pojawia się bez zmiany wysokości.
        // Ograniczone w czasie — to nie jest stałe odpytywanie.
        [300, 1000, 2500, 5000, 9000].forEach(function (delay) {
            setTimeout(report, delay);
        });

        report();
    })();`;

export function escapeAttr(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Składa pełny dokument HTML widgetu.
 *
 * @param {object} options
 * @param {string} options.title      tytuł dokumentu
 * @param {string} options.body       treść karty (widgety `api-sports-widget`)
 * @param {string[]} [options.scripts] dodatkowe skrypty inline strony
 * @param {string} [options.styles]   CSS specyficzny dla tej strony (układ, nie motyw)
 * @param {boolean} [options.embed]   tryb osadzony w zakładce zamiast osobnego okna
 * @param {'light'|'dark'} [options.theme] motyw początkowy — ustawiany od razu w HTML,
 *   żeby nie było mignięcia jasnym tłem przed pierwszą wiadomością od rodzica
 */
export function renderApiSportsPage({
	title,
	body,
	scripts = [],
	styles = '',
	embed = false,
	theme = 'light',
}) {
	const apiKey = widgetKey();
	const htmlClass = [theme === 'dark' ? 'dark' : '', embed ? 'embed' : ''].filter(Boolean).join(' ');
	const inlineScripts = [CUSTOM_LANG_SCRIPT, ...(embed ? [EMBED_BRIDGE_SCRIPT] : []), ...scripts]
		.map((script) => `<script>${script}</script>`)
		.join('\n');

	return `<!DOCTYPE html>
<html lang="en"${htmlClass ? ` class="${htmlClass}"` : ''}>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeAttr(title)}</title>
    <style>${SHARED_STYLES}
${styles}
    </style>
    <script type="module" crossorigin src="${WIDGET_SCRIPT}"></script>
</head>
<body>
    <div class="widget-wrapper">
        <div class="widget-card">${body}</div>
    </div>

    ${apiKey ? configWidget(apiKey) : MISSING_KEY_NOTICE}

${inlineScripts}
</body>
</html>`;
}

/**
 * Odczytuje wspólne parametry prezentacji z adresu.
 * Trzymane tutaj, żeby wszystkie trasy widgetów rozumiały je tak samo.
 */
export function readPresentation(searchParams) {
	return {
		embed: searchParams.get('embed') === '1',
		theme: searchParams.get('theme') === 'dark' ? 'dark' : 'light',
		locale: searchParams.get('locale') === 'pl' ? 'pl' : 'en',
	};
}

/** Wspólne nagłówki: dokument jest per-request (klucz z env), więc nie może trafić do cache. */
export const WIDGET_RESPONSE_HEADERS = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'no-store',
};
