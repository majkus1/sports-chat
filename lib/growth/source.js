/**
 * Źródło rejestracji (first touch) — przechwycenie, walidacja i klasyfikacja. Czysty JS, bez sieci
 * i bazy: ten sam plik czyta przeglądarka (`lib/growth/firstTouch.js`) i serwer (trasy rejestracji).
 *
 * PO CO. Do 21.11.2026 założyło konto 10 osób z zewnątrz i nikt nie wie, skąd przyszły: przy koncie
 * nie było ani źródła, ani utm, a Google Analytics (za zgodą) nie łączy wizyt z kontami. Bez tego
 * każda decyzja „gdzie pisać posty" jest zgadywaniem.
 *
 * CO ZAPISUJEMY — I CZEGO NIE. Pięć rzeczy: host strony, z której ktoś przyszedł (sam host, bez
 * ścieżki — ścieżka referrera potrafi nieść zapytanie z wyszukiwarki albo identyfikator z innego
 * serwisu), trzy parametry utm, ścieżkę pierwszej strony u nas (bez zapytania i kotwicy) i datę.
 * Bez IP, bez identyfikatora przeglądarki, bez pełnego adresu.
 *
 * WALIDACJA OSTRA, NIE NAPRAWCZA. Wartość spoza wzorca odpada w całości (`null`), zamiast być
 * „oczyszczana" — utm idą później do panelu admina, a wartość przycięta do dozwolonych znaków
 * potrafi wyglądać jak prawdziwa kampania. Limity długości (utm 64, host 100, ścieżka 120) są
 * kilkukrotnie dłuższe niż cokolwiek, co sami wpisujemy w linki (najdłuższa kampania ma 13 znaków).
 */

export const UTM_MAX = 64;
export const HOST_MAX = 100;
export const PATH_MAX = 120;
/** Pierwsze wejście starsze niż 30 dni nie jest już „źródłem tej rejestracji". */
export const TOUCH_MAX_AGE_MS = 30 * 86_400_000;
/** Zegar przeglądarki bywa przestawiony o kilka minut — tyle tolerujemy „z przyszłości". */
const CLOCK_SKEW_MS = 10 * 60_000;

/** Kanały w kolejności, w jakiej pokazuje je panel. */
export const CHANNELS = ['search', 'social', 'ai', 'campaign', 'email', 'paid', 'referral', 'direct', 'unknown'];

const UTM_RE = /^[a-z0-9][a-z0-9._-]*$/;
// Etykieta domeny: litery, cyfry, myślnik w środku; co najmniej jedna kropka nie jest wymagana (localhost).
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/;

/**
 * Wartość utm albo `null`. Małe litery, spacje → myślnik (ktoś wpisze „Grupa FB"); poza tym tylko
 * `a-z 0-9 . _ -`. Cokolwiek innego — `<`, cudzysłów, `$`, kropka na początku — odrzuca wartość.
 */
export function cleanUtm(value) {
	if (typeof value !== 'string') return null;
	const v = value.trim().toLowerCase().replace(/\s+/g, '-');
	if (!v || v.length > UTM_MAX || !UTM_RE.test(v)) return null;
	return v;
}

/** Host bez `www.` i kropki na końcu, małymi literami — albo `null`. */
export function cleanHost(value) {
	if (typeof value !== 'string') return null;
	const v = value.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
	if (!v || v.length > HOST_MAX || !HOST_RE.test(v)) return null;
	return v;
}

/** Ścieżka u nas: od `/`, bez zapytania i kotwicy, przycięta do 120 znaków — albo `null`. */
export function cleanPath(value) {
	if (typeof value !== 'string') return null;
	const v = value.split(/[?#]/)[0];
	if (!v || !PATH_RE.test(v)) return null;
	return v.slice(0, PATH_MAX);
}

/** Data pierwszego wejścia: nie z przyszłości i nie starsza niż 30 dni — inaczej `null`. */
export function cleanDate(value, now = new Date()) {
	if (typeof value !== 'string' && !(value instanceof Date)) return null;
	const d = new Date(value);
	const t = d.getTime();
	if (!Number.isFinite(t)) return null;
	if (t > now.getTime() + CLOCK_SKEW_MS || t < now.getTime() - TOUCH_MAX_AGE_MS) return null;
	return d;
}

/**
 * Host strony, z której przyszło wejście. Własna domena to nie źródło (przejście wewnątrz serwisu
 * po pełnym przeładowaniu), więc `null`. `android-app://com.google.android.gm` — aplikacje na
 * Androidzie podają pakiet zamiast domeny; zostawiamy go jako „host", bo też mówi, skąd ktoś jest.
 */
export function referrerHost(referrer, ownHosts = []) {
	if (typeof referrer !== 'string' || !referrer) return null;
	let url;
	try {
		url = new URL(referrer);
	} catch {
		return null;
	}
	if (!['http:', 'https:', 'android-app:'].includes(url.protocol)) return null;
	const host = cleanHost(url.hostname);
	if (!host) return null;
	const wlasne = ownHosts.map(cleanHost).filter(Boolean);
	return wlasne.includes(host) ? null : host;
}

/**
 * Pierwsze wejście z adresu strony i referrera — to, co zapamiętuje przeglądarka.
 *
 * @param {{ href: string, referrer?: string, ownHosts?: string[], now?: Date }} input
 * @returns {{ referrerHost: string|null, utmSource: string|null, utmMedium: string|null,
 *   utmCampaign: string|null, landingPath: string|null, at: string }}
 */
export function captureTouch({ href, referrer = '', ownHosts = [], now = new Date() }) {
	let url = null;
	try {
		url = new URL(href);
	} catch {
		/* zły adres — zostaje sam referrer i data */
	}
	const q = url?.searchParams;
	return {
		referrerHost: referrerHost(referrer, [...ownHosts, url?.hostname].filter(Boolean)),
		utmSource: cleanUtm(q?.get('utm_source') ?? null),
		utmMedium: cleanUtm(q?.get('utm_medium') ?? null),
		utmCampaign: cleanUtm(q?.get('utm_campaign') ?? null),
		landingPath: cleanPath(url?.pathname ?? null),
		at: now.toISOString(),
	};
}

const pasuje = (host, domeny) => domeny.some((d) => host === d || host.endsWith(`.${d}`));

// Asystenci AI przed wyszukiwarkami: `gemini.google.com` to nie wyszukiwarka Google.
const AI = ['chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'you.com', 'phind.com', 'chat.mistral.ai', 'grok.com'];
const SEARCH = ['bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org', 'search.brave.com', 'startpage.com', 'qwant.com', 'seznam.cz', 'com.google.android.googlequicksearchbox'];
const SOCIAL = [
	'facebook.com', 'fb.com', 'messenger.com', 'instagram.com', 'threads.net', 'x.com', 'twitter.com', 't.co', 'tiktok.com',
	'youtube.com', 'youtu.be', 'linkedin.com', 'lnkd.in', 'reddit.com', 'wykop.pl', 't.me', 'telegram.org', 'discord.com',
	'whatsapp.com', 'pinterest.com', 'bsky.app', 'com.facebook.katana', 'org.telegram.messenger', 'com.zhiliaoapp.musically',
];
const EMAIL = ['mail.google.com', 'com.google.android.gm', 'poczta.onet.pl', 'poczta.wp.pl', 'poczta.interia.pl', 'outlook.live.com', 'mail.yahoo.com'];
const UTM_SOCIAL = new Set(['x', 'twitter', 'facebook', 'fb', 'instagram', 'ig', 'tiktok', 'youtube', 'telegram', 'reddit', 'wykop', 'threads', 'linkedin', 'discord', 'whatsapp']);

/**
 * Kanał wejścia — jedna z `CHANNELS`. Najpierw utm (nasz własny opis linku), potem host referrera.
 * `email` przed wyszukiwarką: `mail.google.com` to nie wyszukiwanie w Google.
 */
export function channelOf({ referrerHost: host = null, utmSource = null, utmMedium = null } = {}) {
	if (utmMedium && ['email', 'newsletter', 'mail'].includes(utmMedium)) return 'email';
	if (utmMedium && ['cpc', 'ppc', 'paid', 'paid-social', 'display', 'ads'].includes(utmMedium)) return 'paid';
	if ((utmMedium && ['social', 'social-organic', 'organic-social'].includes(utmMedium)) || (utmSource && UTM_SOCIAL.has(utmSource))) return 'social';
	if (utmSource) return 'campaign';
	if (!host) return 'direct';
	if (pasuje(host, AI)) return 'ai';
	if (pasuje(host, EMAIL)) return 'email';
	if (/(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)yandex\.[a-z.]+$/.test(host) || pasuje(host, SEARCH)) return 'search';
	if (pasuje(host, SOCIAL)) return 'social';
	return 'referral';
}

/** Puste źródło: klient nic nie przysłał (stara wersja strony w otwartej karcie, blokada skryptów). */
const NIEZNANE = {
	channel: 'unknown',
	referrerHost: null,
	utmSource: null,
	utmMedium: null,
	utmCampaign: null,
	landingPath: null,
	firstSeenAt: null,
};

/**
 * Źródło do zapisu przy koncie (`User.signupSource`) — z tego, co przysłała przeglądarka.
 *
 * Serwer niczemu z klienta nie ufa: każde pole przechodzi tę samą walidację co przy przechwyceniu,
 * a obiekt większy niż 1 kB albo nie-obiekt kończy się `channel: 'unknown'`. Kanał liczy serwer,
 * nie przeglądarka — inaczej dało się go podać wprost.
 *
 * @param {unknown} raw `signupSource` z ciała żądania rejestracji
 * @param {{ now?: Date, ownHosts?: string[] }} [options]
 */
export function normalizeSignupSource(raw, { now = new Date(), ownHosts = [] } = {}) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...NIEZNANE };
	let rozmiar = Infinity;
	try {
		rozmiar = JSON.stringify(raw).length;
	} catch {
		/* obiekt z cyklem — traktujemy jak brak */
	}
	if (rozmiar > 1024) return { ...NIEZNANE };

	const host = cleanHost(raw.referrerHost);
	const wlasne = ownHosts.map(cleanHost).filter(Boolean);
	const out = {
		referrerHost: host && !wlasne.includes(host) ? host : null,
		utmSource: cleanUtm(raw.utmSource),
		utmMedium: cleanUtm(raw.utmMedium),
		utmCampaign: cleanUtm(raw.utmCampaign),
		landingPath: cleanPath(raw.landingPath),
		firstSeenAt: cleanDate(raw.at, now),
	};
	// Bez ścieżki i bez daty to nie jest przechwycone wejście, tylko śmieci — nie udajemy „direct".
	if (!out.landingPath && !out.firstSeenAt && !out.referrerHost && !out.utmSource) return { ...NIEZNANE };
	return { channel: channelOf(out), ...out };
}

/**
 * Link z oznaczeniem utm — dla postów (`lib/growth/posts.js`) i wszystkiego, co publikujemy ręcznie.
 *
 * Te same reguły co przy odczycie: wartość, której `cleanUtm` by nie przepuścił, rzuca błąd tu,
 * przy budowaniu, a nie znika po cichu przy rejestracji. Dzięki temu link z posta zawsze daje
 * w panelu dokładnie to źródło, które w nim wpisano.
 *
 * @param {string} siteUrl adres serwisu bez ukośnika na końcu
 * @param {string} path ścieżka z prefiksem języka, np. `/pl/typy-na-dzis`
 * @param {{ source: string, medium?: string, campaign: string }} utm
 */
export function utmUrl(siteUrl, path, { source, medium = 'social', campaign }) {
	const pary = { utm_source: source, utm_medium: medium, utm_campaign: campaign };
	for (const [k, v] of Object.entries(pary)) {
		if (cleanUtm(v) !== v) throw new Error(`utmUrl: niedozwolona wartość ${k}=${v}`);
	}
	const q = new URLSearchParams(pary).toString();
	return `${String(siteUrl || '').replace(/\/$/, '')}${path}?${q}`;
}
