/**
 * Manifest aplikacji webowej.
 *
 * Nie robimy z serwisu instalowalnej aplikacji — nie ma trybu offline ani powiadomień push.
 * Manifest daje jednak dwie rzeczy za darmo: sensowną nazwę i ikonę po dodaniu do ekranu
 * głównego oraz kolor paska adresu na Androidzie zamiast domyślnej bieli.
 */
export default function manifest() {
	return {
		name: 'Czat Sportowy — analizy AI i czat na żywo',
		short_name: 'Czat Sportowy',
		description:
			'Analizy meczów tworzone przez AI, czat na żywo przy każdym spotkaniu i typowanie ' +
			'ze statystyką skuteczności.',
		start_url: '/pl',
		display: 'standalone',
		// Kolory z tokenów motywu: --brand i --bg z app/globals.css.
		background_color: '#f4f6f7',
		theme_color: '#173b45',
		lang: 'pl',
		categories: ['sports', 'news'],
		icons: [
			{ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
		],
	};
}
