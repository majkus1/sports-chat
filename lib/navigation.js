/**
 * Struktura nawigacji po dyscyplinach — jedno źródło dla menu w nagłówku i dla stopki.
 *
 * Działy takie jak przedmeczowe, live czy raport AI należą do konkretnej dyscypliny,
 * a nie do serwisu. Trzymane płasko sugerowałyby, że to główne sekcje strony — a przy
 * drugiej dyscyplinie od razu przestałyby mieć sens.
 *
 * Dodanie sportu to dopisanie wpisu: menu i stopka rozbudują się same.
 * `labelKey` wskazuje klucz w messages/{pl,en}.json.
 */
export const SPORT_CATEGORIES = [
	{
		key: 'football',
		labelKey: 'footbalitemmenu',
		sections: [
			{ href: '/pilka-nozna/przedmeczowe', labelKey: 'match' },
			{ href: '/pilka-nozna/live', labelKey: 'onlive' },
			{ href: '/pilka-nozna/ai-agent', labelKey: 'ai_agent_title' },
			{ href: '/pilka-nozna/kolejka', labelKey: 'round_menu' },
			{ href: '/pilka-nozna/skutecznosc', labelKey: 'accuracy_menu' },
		],
	},
];

/** Odnośniki ogólne, niezwiązane z żadną dyscypliną. */
export const SITE_LINKS = [
	{ href: '/', labelKey: 'mainpage' },
	{ href: '/jak-to-dziala', labelKey: 'method_title' },
	{ href: '/cennik', labelKey: 'pricing_title' },
	{ href: '/blog', labelKey: 'blog_title' },
	{ href: '/kontakt', labelKey: 'contact_title' },
];

/**
 * Dokumenty prawne — osobna kolumna w stopce.
 *
 * Wmieszane między odnośniki serwisowe ginęłyby, a regulamin i polityka prywatności mają
 * być łatwe do znalezienia z każdej strony; tego wymaga obowiązek informacyjny.
 */
export const LEGAL_LINKS = [
	{ href: '/regulamin', labelKey: 'terms_title' },
	{ href: '/zwroty', labelKey: 'refunds_title' },
	{ href: '/polityka-prywatnosci', labelKey: 'privacy_title' },
];
