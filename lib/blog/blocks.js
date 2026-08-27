/**
 * Klocki, z których składa się treść wpisu.
 *
 * Treść trzymamy jako dane, a nie jako JSX — ten sam wzorzec co w `lib/legal/documents.js`.
 * Dzięki temu jeden komponent renderuje wszystkie wpisy, a dodanie tekstu nie wymaga
 * dotykania układu strony ani myślenia o klasach CSS.
 */

export const p = (text) => ({ type: 'p', text });
export const ul = (items) => ({ type: 'ul', items });
export const h3 = (text) => ({ type: 'h3', text });

/** Wyróżniona uwaga na marginesie — ostrzeżenie albo wniosek wart zapamiętania. */
export const note = (text) => ({ type: 'note', text });
