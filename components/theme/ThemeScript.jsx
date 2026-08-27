/**
 * Ustawia klasę motywu na <html> zanim przeglądarka cokolwiek narysuje.
 *
 * Gdyby robił to React po hydracji, przy każdym wejściu mignęłoby jasne tło —
 * dlatego to zwykły skrypt wstrzykiwany w <head>, wykonywany synchronicznie.
 */
const SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('czat-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    /* prywatne okno bez localStorage — zostaje motyw jasny */
  }
})();
`;

export default function ThemeScript() {
	return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
