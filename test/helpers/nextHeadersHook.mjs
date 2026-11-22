/**
 * Podmienia `next/headers` na atrapę z ciasteczkami ustawianymi w teście (`nextHeadersStub.mjs`).
 *
 * Trasa Next.js czyta sesję przez `cookies()` z `next/headers`, a poza serwerem Next.js ta funkcja nie
 * ma żądania, z którego mogłaby czytać (i goły Node nie znajduje nawet modułu bez `.js`). Z atrapą
 * test woła prawdziwy `POST` trasy z prawdziwą weryfikacją tokenu — bez uruchamiania `next dev`.
 * Rejestruje go tylko plik testowy, który tego potrzebuje (`register` w tym pliku).
 */
const STUB = new URL('./nextHeadersStub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'next/headers') return { url: STUB, shortCircuit: true };
	return nextResolve(specifier, context);
}
