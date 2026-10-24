import { AiRefusalError } from '@/lib/ai';
import {
	ANALYSIS_MESSAGES,
	generateAnalysis,
	prepareAnalysis,
	resolveLanguage,
} from '@/lib/analysis/service';

export const maxDuration = 300;

/**
 * Wygenerowanie analizy w jednym żądaniu.
 *
 * Odpowiednik trasy strumieniowej dla klientów, którym nie zależy na podglądzie w trakcie
 * (albo dla których strumień zawiódł). Cała logika limitów, generowania i zapisu jest wspólna
 * (także z asystentem) — patrz lib/analysis/service.js.
 */
export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'Invalid request body' }, { status: 400 });
	}

	const fixtureId = String(body?.fixtureId || '').trim();
	if (!/^\d{1,12}$/.test(fixtureId)) {
		return Response.json({ error: 'Missing or invalid fixtureId' }, { status: 400 });
	}

	const language = resolveLanguage(request, body?.language);
	const t = ANALYSIS_MESSAGES[language];

	let prepared;
	try {
		prepared = await prepareAnalysis({ request, fixtureId, language, force: body?.force === true });
	} catch (error) {
		console.error('[analysis] przygotowanie nie powiodło się:', error.message);
		return Response.json({ error: 'generation_failed', message: t.failed }, { status: 500 });
	}

	if (prepared.status === 'cached') {
		return Response.json(
			{ analysis: prepared.analysis, sections: prepared.sections, cached: true },
			{ status: 200 }
		);
	}

	if (prepared.status === 'blocked') {
		const { status, httpStatus, release, ...payload } = prepared;
		return Response.json({ error: payload.code, ...payload }, { status: httpStatus });
	}

	try {
		// Sekcje po związaniu z modelem liczbowym — to one są zapisane, więc to one idą do klienta.
		const { analysisText, sections: gotowe } = await generateAnalysis(prepared, { fixtureId, language });

		return Response.json({ analysis: analysisText, sections: gotowe, cached: false }, { status: 200 });
	} catch (error) {
		if (error instanceof AiRefusalError) {
			console.warn('[analysis] odmowa modelu:', error.category);
			return Response.json({ error: 'refused', message: t.refused }, { status: 422 });
		}
		console.error('[analysis] błąd generowania:', error.message);
		return Response.json(
			{
				error: 'generation_failed',
				message: t.failed,
				details: process.env.NODE_ENV === 'development' ? error.message : undefined,
			},
			{ status: 500 }
		);
	} finally {
		await prepared.release();
	}
}
