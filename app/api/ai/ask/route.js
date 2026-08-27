import connectToDb from '@/lib/db';
import AiConversation from '@/models/AiConversation';
import MatchAnalysis from '@/models/MatchAnalysis';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkQuota, consumeQuota, recordUsage } from '@/lib/billing/entitlements';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { buildFixtureBundle } from '@/lib/football/bundle';
import { generateText, AiRefusalError } from '@/lib/ai';
import {
	ASSISTANT_SYSTEM_PROMPT,
	CHAT_REPLY_PROMPT_VERSION,
	buildChatReplyPrompt,
} from '@/lib/ai/prompts/chatReply';
import { MODEL_CHAT, MAX_TOKENS_CHAT } from '@/lib/ai/config';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';

export const maxDuration = 120;

/**
 * Prywatna rozmowa z asystentem pod analizą meczu.
 *
 * W odróżnieniu od `@AI` w czacie pokoju (app/api/ai/chat-reply) ta trasa jest wołana
 * z przeglądarki i wymaga sesji: wątek należy do konkretnego konta i nikt inny go nie widzi.
 * Limit dzienny jest ten sam co dla `@AI` — to ta sama usługa, tylko w innym miejscu.
 */

/** Ile ostatnich wiadomości wątku trafia do modelu. */
const CONTEXT_SIZE = 20;
/** Ile wiadomości trzymamy w bazie — starsze i tak nie wchodzą już do kontekstu. */
const KEEP_MESSAGES = 60;

const FIXTURE_ID = /^\d{1,12}$/;

function readLanguage(body) {
	return body?.language === 'en' ? 'en' : 'pl';
}

/** Historia wątku dla otwartej zakładki. */
export async function GET(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const fixtureId = (searchParams.get('fixtureId') || '').trim();
	const language = searchParams.get('language') === 'en' ? 'en' : 'pl';

	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}

	await connectToDb();
	const thread = await AiConversation.findOne({ userId: session.userId, fixtureId, language })
		.select('messages')
		.lean();

	return Response.json({ messages: thread?.messages || [] });
}

export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const fixtureId = String(body?.fixtureId || '').trim();
	const question = String(body?.question || '').trim();
	const language = readLanguage(body);

	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}
	if (!question) {
		return Response.json({ error: 'empty_question' }, { status: 400 });
	}
	if (question.length > MAX_CHAT_MSG_LEN) {
		return Response.json({ error: 'question_too_long' }, { status: 400 });
	}

	try {
		await connectToDb();

		const user = await User.findById(session.userId)
			.select('plan planStatus planValidUntil role credits createdAt')
			.lean();

		const quota = await checkQuota({ kind: 'aiChat', user, userId: session.userId });
		if (!quota.allowed) {
			return Response.json(
				{ error: 'daily_limit', limit: quota.limit, used: quota.used, plan: quota.plan },
				{ status: 429 }
			);
		}

		const thread = await AiConversation.findOne({ userId: session.userId, fixtureId, language });
		const history = (thread?.messages || []).slice(-CONTEXT_SIZE);

		/*
		 * Pełny pakiet, nie wycinek.
		 *
		 * Wcześniej szły tu tylko `core, form, h2h`, więc asystent nie znał tabeli, statystyk
		 * meczu ani zdarzeń — odpowiadał „nie mam takich danych" na pytanie o rzecz stojącą
		 * w analizie tuż nad rozmową. Bez `sections` pakiet sam dobiera zestaw po statusie
		 * meczu, czyli w trakcie gry dołoży też zdarzenia, statystyki i oceny zawodników.
		 * Wszystko idzie z tego samego cache'u co analiza, więc koszt jest znikomy.
		 *
		 * Brak danych meczu lub analizy nie blokuje rozmowy — asystent po prostu wie mniej.
		 */
		const [bundleResult, analysisResult] = await Promise.allSettled([
			buildFixtureBundle(fixtureId),
			MatchAnalysis.findOne({ fixtureId, language }).select('analysis sections').lean(),
		]);

		const bundle = bundleResult.status === 'fulfilled' ? bundleResult.value : null;
		const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;

		const { text, meta } = await generateText({
			model: MODEL_CHAT,
			system: ASSISTANT_SYSTEM_PROMPT,
			messages: [
				{
					role: 'user',
					content: buildChatReplyPrompt({
						question,
						history,
						bundle,
						analysisText: analysis?.analysis || null,
						analysisSections: analysis?.sections || null,
						language,
						private_: true,
					}),
				},
			],
			maxTokens: MAX_TOKENS_CHAT,
		});

		if (!text) return Response.json({ error: 'empty_reply' }, { status: 502 });

		const now = new Date();
		const appended = [
			{ role: 'user', content: question, at: now },
			{ role: 'assistant', content: text, at: new Date(now.getTime() + 1) },
		];

		/*
		 * `$slice` przycina wątek przy zapisie — bez tego rozmowa rosłaby bez końca,
		 * choć do modelu i tak trafia tylko ostatnie kilkanaście wiadomości.
		 */
		await AiConversation.updateOne(
			{ userId: session.userId, fixtureId, language },
			{
				$push: { messages: { $each: appended, $slice: -KEEP_MESSAGES } },
				$set: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
			},
			{ upsert: true }
		);

		// Licznik i dziennik dopiero po udanej odpowiedzi.
		await consumeQuota({ kind: 'aiChat', user, userId: session.userId, usingCredit: quota.usingCredit });
		await recordSpend(meta.costUsd);
		await recordUsage({
			userId: session.userId,
			kind: 'aiChat',
			plan: quota.plan,
			provider: meta.provider,
			model: meta.model,
			tokensIn: meta.tokensIn,
			tokensOut: meta.tokensOut,
			costUsd: meta.costUsd,
			fixtureId,
		});

		return Response.json({
			messages: appended,
			meta: { promptVersion: CHAT_REPLY_PROMPT_VERSION },
		});
	} catch (error) {
		if (error instanceof AiRefusalError) {
			return Response.json({ error: 'refused' }, { status: 422 });
		}
		console.error('[ai/ask] błąd:', error.message);
		return Response.json({ error: 'generation_failed' }, { status: 500 });
	}
}
