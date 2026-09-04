import connectToDb from '@/lib/db';
import Report from '@/models/Report';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkQuota, consumeQuota, recordUsage } from '@/lib/billing/entitlements';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { streamStructured, AiRefusalError } from '@/lib/ai';
import { REPORT_SCHEMA } from '@/lib/ai/schemas';
import { REPORT_SYSTEM_PROMPT, REPORT_PROMPT_VERSION, buildReportPrompt } from '@/lib/ai/prompts/report';
import { MODEL_ANALYSIS, MAX_TOKENS_ANALYSIS } from '@/lib/ai/config';
import { parsePartialJson } from '@/lib/ai/partialJson';
import { formatFrame } from '@/lib/sse/parseFrames';
import { buildReportCandidates, bindPicksToSelection, REPORT_WINDOWS } from '@/lib/reports/service';
import { leagueTier } from '@/lib/football/leagues';
import { recordPicks } from '@/lib/picks/service';
import { sameSelection } from '@/lib/picks/markets';

export const maxDuration = 300;

/**
 * Generowanie raportu AI strumieniem (SSE po POST — wzorzec z analysis-stream).
 *
 * Raport wymaga sesji: wynik zapisuje się na koncie, a limit tygodniowy liczy się
 * po użytkowniku. Zdarzenia: `status` (selecting | generating), `partial`, `done`, `error`.
 */

const PARTIAL_INTERVAL_MS = 220;

const MESSAGES = {
	pl: {
		limit: 'Wykorzystałeś miesięczny limit raportów ({limit}). Limit odnawia się pierwszego dnia miesiąca.',
		noReports: 'Raporty AI są dostępne w planie Pro i VIP. Nowe konto dostaje 2 raporty na start.',
		busy: 'Generowanie raportów jest chwilowo wstrzymane. Spróbuj ponownie później.',
		failed: 'Nie udało się wygenerować raportu. Spróbuj ponownie za chwilę.',
		refused: 'Model nie mógł przygotować raportu.',
		emptyIntro: 'W tym oknie czasowym selekcja nie znalazła meczów o wystarczającej wartości.',
		emptySummary: 'Spróbuj ponownie, gdy terminarz będzie bogatszy — raport pokazuje tylko typy, które dane wspierają wyraźnie.',
	},
	en: {
		limit: 'You have used the monthly report limit ({limit}). It resets on the first of the month.',
		noReports: 'AI reports are available on the Pro and VIP plans. New accounts get 2 to start.',
		busy: 'Report generation is paused for now. Please try again later.',
		failed: 'Could not generate the report. Please try again in a moment.',
		refused: 'The model could not prepare the report.',
		emptyIntro: 'The selection found no sufficiently valuable matches in this time window.',
		emptySummary: 'Try again when the fixture list is richer — the report only shows picks the data clearly supports.',
	},
};

export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const type = REPORT_WINDOWS[body?.type] ? body.type : 'soon';
	const language = body?.language === 'en' ? 'en' : 'pl';
	const t = MESSAGES[language];

	await connectToDb();
	const user = await User.findById(session.userId)
		.select('plan planStatus planValidUntil role credits createdAt')
		.lean();

	const spend = await checkSpendCap();
	if (!spend.allowed) {
		console.error(`[billing] dzienny próg wydatków przekroczony: $${spend.spent.toFixed(2)}/$${spend.cap}`);
		return Response.json({ error: 'temporarily_unavailable', message: t.busy }, { status: 503 });
	}

	const quota = await checkQuota({ kind: 'report', user, userId: session.userId });
	if (!quota.allowed) {
		// Plan darmowy ma limit 0 — to nie „wyczerpany limit", tylko funkcja płatna.
		// Poza trialem, w którym pula jest doliczona.
		if (quota.limit === 0) {
			return Response.json({ error: 'plan_required', message: t.noReports, plan: quota.plan }, { status: 403 });
		}
		return Response.json(
			{
				error: 'limit_exceeded',
				message: t.limit.replace('{limit}', String(quota.limit)),
				limit: quota.limit,
				used: quota.used,
				plan: quota.plan,
			},
			{ status: 429 }
		);
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const send = (event, data) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(formatFrame(event, data)));
				} catch {
					// Klient zamknął połączenie — dokończymy, żeby zapisać raport na koncie.
					closed = true;
				}
			};

			try {
				send('status', { stage: 'selecting' });
				const { candidates, poolSize, examined } = await buildReportCandidates({ type });

				let sections;
				let meta = null;

				if (!candidates.length) {
					// Bez kandydatów nie ma czego pisać — uczciwy pusty raport zamiast
					// wywołania modelu, które i tak nie miałoby treści do pracy.
					sections = { intro: t.emptyIntro, picks: [], summary: t.emptySummary };
				} else {
					send('status', { stage: 'generating', candidates: candidates.length });

					let lastPartialAt = 0;
					({ data: sections, meta } = await streamStructured({
						model: MODEL_ANALYSIS,
						system: REPORT_SYSTEM_PROMPT,
						user: buildReportPrompt(candidates, { type, language }),
						schema: REPORT_SCHEMA,
						maxTokens: MAX_TOKENS_ANALYSIS,
						onProgress: (accumulated) => {
							const now = Date.now();
							if (now - lastPartialAt < PARTIAL_INTERVAL_MS) return;
							const partial = parsePartialJson(accumulated);
							if (!partial) return;
							lastPartialAt = now;
							send('partial', { sections: partial });
						},
					}));
				}

				/*
				 * Liczby wracają do wartości z selekcji, a przy typie ląduje norma rynku
				 * i przewaga. Zapisujemy już związane, żeby zapisany raport pokazywał to samo,
				 * co panel skuteczności policzy.
				 */
				sections.picks = bindPicksToSelection(sections.picks, candidates);

				const report = await Report.create({
					userId: session.userId,
					type,
					language,
					status: 'ready',
					sections,
					fixtureCount: sections.picks?.length ?? 0,
					candidateCount: candidates.length,
					provider: meta?.provider ?? null,
					model: meta?.model ?? null,
					promptVersion: REPORT_PROMPT_VERSION,
					tokensIn: meta?.tokensIn ?? null,
					tokensOut: meta?.tokensOut ?? null,
					costUsd: meta?.costUsd ?? null,
				});

				// Typy raportu do osobnej kolekcji — na ich podstawie liczymy skuteczność.
				await recordPicks({
					picks: sections.picks || [],
					kind: 'report',
					source: 'report',
					sourceId: report._id,
					userId: session.userId,
					fixtureResolver: (pick) => ({
						fixtureId: pick.fixtureId,
						// „Gospodarze vs Goście" — rozbijamy na strony, żeby parser umiał
						// rozpoznać nazwę drużyny w selekcji typu.
						homeName: String(pick.match || '').split(/\s+vs\s+/i)[0]?.trim() || null,
						awayName: String(pick.match || '').split(/\s+vs\s+/i)[1]?.trim() || null,
						leagueName: pick.league ?? null,
						kickoff: pick.kickoffUtc,
					}),
					/*
					 * Kontekst per typ, nie wspólny: raport obejmuje kilkanaście różnych
					 * meczów, każdy z własną ligą i własną próbą meczową. Dane bierzemy
					 * z kandydata, na podstawie którego typ powstał.
					 */
					context: (pick, normalized) => {
						const kandydat = candidates.find((c) => String(c.fixtureId) === String(pick.fixtureId));
						// Prawdopodobieństwo rynkowe selekcji — do sufitu i do pomiaru, nie do treści.
						const wpis = kandydat
							? [kandydat.best, ...(kandydat.otherMarkets || [])].find((m) =>
									sameSelection(m.normalized, normalized)
								)
							: null;
						return {
							marketProbability: wpis?.marketProbability ?? null,
							promptVersion: REPORT_PROMPT_VERSION,
							modelVersion: meta?.model ?? null,
							// `buildReportCandidates` zapisuje ją przy kandydacie, gdy model policzył selekcje.
							numericModelVersion: kandydat?.modelVersion ?? null,
							leagueId: kandydat?.leagueId ?? null,
							leagueTier: leagueTier(kandydat?.leagueId),
							// Kandydat przechodzi selekcję tylko z kompletem tych sekcji.
							sectionsPresent: kandydat ? ['form', 'prediction'] : [],
							playedHome: kandydat?.formHome?.played?.total ?? null,
							playedAway: kandydat?.formAway?.played?.total ?? null,
						};
					},
				});

				// Limit i dziennik dopiero po udanym zapisie — nieudany raport nie kosztuje.
				await consumeQuota({ kind: 'report', user, userId: session.userId, usingCredit: quota.usingCredit });
				await recordSpend(meta?.costUsd);
				await recordUsage({
					userId: session.userId,
					kind: 'report',
					plan: quota.plan,
					provider: meta?.provider ?? null,
					model: meta?.model ?? null,
					tokensIn: meta?.tokensIn ?? null,
					tokensOut: meta?.tokensOut ?? null,
					costUsd: meta?.costUsd ?? null,
				});

				send('done', {
					reportId: String(report._id),
					sections,
					meta: { poolSize, examined, candidates: candidates.length },
				});
			} catch (error) {
				if (error instanceof AiRefusalError) {
					console.warn('[reports] odmowa modelu:', error.category);
					send('error', { code: 'refused', message: t.refused });
				} else {
					console.error('[reports] błąd generowania:', error.message);
					send('error', { code: 'generation_failed', message: t.failed });
				}
			} finally {
				if (!closed) controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// Nginx buforuje odpowiedzi proxy — bez tego zdarzenia doszłyby dopiero na końcu.
			'X-Accel-Buffering': 'no',
		},
	});
}
