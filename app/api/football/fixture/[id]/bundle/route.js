import { buildFixtureBundle, parseSections } from '@/lib/football/bundle';
import { limitByIp, tooManyRequests } from '@/lib/rateLimit';

/**
 * Jedno źródło danych o meczu dla interfejsu i dla analiz AI.
 *
 * GET /api/football/fixture/123?sections=core,form,h2h
 * Bez parametru `sections` zestaw dobiera się automatycznie po statusie meczu.
 */
export async function GET(request, { params }) {
	const { id } = await params;

	if (!/^\d{1,12}$/.test(String(id || ''))) {
		return Response.json({ error: 'Invalid fixture id' }, { status: 400 });
	}

	// Każda sekcja to potencjalnie osobne zapytanie do płatnego API — limit chroni budżet.
	const rate = await limitByIp(request, {
		scope: 'fixture-bundle',
		limit: 60,
		windowSeconds: 60,
		failOpen: true,
	});
	if (!rate.allowed) return tooManyRequests(rate.retryAfter);

	const { searchParams } = new URL(request.url);
	const sections = parseSections(searchParams.get('sections'));

	try {
		const bundle = await buildFixtureBundle(id, { sections });
		if (!bundle) {
			return Response.json({ error: 'Fixture not found' }, { status: 404 });
		}
		return Response.json(bundle, {
			status: 200,
			// Cache po stronie serwera robi Redis; tu tylko krótki oddech dla przeglądarki.
			headers: { 'Cache-Control': 'private, max-age=15' },
		});
	} catch (error) {
		console.error('[bundle] błąd budowania pakietu:', error.message);
		return Response.json(
			{
				error: 'bundle_failed',
				details: process.env.NODE_ENV === 'development' ? error.message : undefined,
			},
			{ status: 502 }
		);
	}
}
