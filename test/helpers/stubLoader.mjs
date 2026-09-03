/**
 * Podmienia wyłącznie moduł endpointów API-Football na atrapę; reszta specyfikatorów
 * idzie dalej, do aliasu `@/` z `alias.mjs`. Używany przez test dymny backtestu —
 * ten musi wykonać cały skrypt, a nie zaimportować jego fragment.
 */
const STUB = new URL('./stubEndpoints.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
	if (specifier === '@/lib/football/endpoints') return { url: STUB, shortCircuit: true };
	return nextResolve(specifier, context);
}
