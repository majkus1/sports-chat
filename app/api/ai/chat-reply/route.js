import crypto from 'crypto';
import connectToDb from '@/lib/db';
import Message from '@/models/Message';
import MatchAnalysis from '@/models/MatchAnalysis';
import User from '@/models/User';
import { CHAT_ID_PATTERN } from '@/lib/chatConstraints';
import { checkQuota, consumeQuota, recordUsage } from '@/lib/billing/entitlements';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { buildFixtureBundle } from '@/lib/football/bundle';
import { generateText, AiRefusalError } from '@/lib/ai';
import {
	CHAT_REPLY_SYSTEM_PROMPT,
	CHAT_REPLY_PROMPT_VERSION,
	buildChatReplyPrompt,
} from '@/lib/ai/prompts/chatReply';
import { MODEL_CHAT, MAX_TOKENS_CHAT } from '@/lib/ai/config';

export const maxDuration = 120;

/** Ile ostatnich wiadomości trafia do kontekstu. Więcej = drożej i bez wyraźnego zysku. */
const HISTORY_SIZE = 40;

/**
 * Odpowiedź asystenta na wzmiankę `@AI` w czacie.
 *
 * Trasa jest wołana wyłącznie serwer-serwer przez proces Socket.IO, nigdy z przeglądarki —
 * stąd wspólny sekret zamiast sesji użytkownika. Limity dzienne liczymy tutaj, bo to ta
 * strona ma dostęp do Redisa; blokadę częstotliwości w pokoju trzyma serwer socketów.
 */
export async function POST(request) {
	const expected = process.env.INTERNAL_API_SECRET || '';
	const provided = request.headers.get('x-internal-secret') || '';

	if (!expected) {
		return Response.json({ error: 'internal_secret_not_configured' }, { status: 503 });
	}

	// Porównanie o stałym czasie — zwykłe `===` przecieka informację o prefiksie sekretu.
	const expectedBuf = Buffer.from(expected);
	const providedBuf = Buffer.from(provided);
	if (
		expectedBuf.length !== providedBuf.length ||
		!crypto.timingSafeEqual(expectedBuf, providedBuf)
	) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const { chatId, question, userId } = body || {};
	const language = body?.language === 'en' ? 'en' : 'pl';

	if (typeof chatId !== 'string' || !CHAT_ID_PATTERN.test(chatId)) {
		return Response.json({ error: 'invalid_chat_id' }, { status: 400 });
	}
	if (typeof question !== 'string' || !question.trim()) {
		return Response.json({ error: 'empty_question' }, { status: 400 });
	}

	try {
		await connectToDb();

		// Limit wynika z planu konta. Niezalogowani nie mogą pisać na czacie,
		// więc userId jest tu zawsze — brak konta traktujemy jak plan darmowy.
		const user = userId
			? await User.findById(userId)
					.select('plan planStatus planValidUntil role credits createdAt')
					.lean()
			: null;

		const quota = await checkQuota({ kind: 'aiChat', user, userId });
		if (!quota.allowed) {
			return Response.json(
				{ error: 'daily_limit', limit: quota.limit, plan: quota.plan },
				{ status: 429 }
			);
		}

		const recent = await Message.find({ chatId })
			.sort({ timestamp: -1 })
			.limit(HISTORY_SIZE)
			.select('username content authorType timestamp')
			.lean();
		const history = recent.reverse();

		// Pokoje meczowe mają identyfikator `Liga-{fixtureId}`; dla innych czatów
		// asystent pracuje bez kontekstu meczu.
		const fixtureId = chatId.startsWith('Liga-') ? chatId.slice(5) : null;

		let bundle = null;
		let analysis = null;

		if (fixtureId && /^\d{1,12}$/.test(fixtureId)) {
			// Pełny pakiet, tak samo jak w rozmowie pod analizą: pytanie „ile Ilves ma
			// punktów" albo „kto strzelił w 41. minucie" ma dostać odpowiedź, a nie
			// informację o braku danych. Dane i tak są już w cache'u po analizie.
			const [bundleResult, analysisResult] = await Promise.allSettled([
				buildFixtureBundle(fixtureId),
				MatchAnalysis.findOne({ fixtureId, language }).select('analysis sections').lean(),
			]);

			if (bundleResult.status === 'fulfilled') bundle = bundleResult.value;
			if (analysisResult.status === 'fulfilled') analysis = analysisResult.value;
		}

		const { text, meta } = await generateText({
			model: MODEL_CHAT,
			system: CHAT_REPLY_SYSTEM_PROMPT,
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
					}),
				},
			],
			maxTokens: MAX_TOKENS_CHAT,
		});

		if (!text) {
			return Response.json({ error: 'empty_reply' }, { status: 502 });
		}

		// Licznik i dziennik dopiero po udanej odpowiedzi.
		await consumeQuota({ kind: 'aiChat', user, userId, usingCredit: quota.usingCredit });
		await recordSpend(meta.costUsd);
		await recordUsage({
			userId: userId || null,
			kind: 'aiChat',
			plan: quota.plan,
			provider: meta.provider,
			model: meta.model,
			tokensIn: meta.tokensIn,
			tokensOut: meta.tokensOut,
			costUsd: meta.costUsd,
			chatId,
			fixtureId,
		});

		return Response.json({
			text,
			meta: { ...meta, promptVersion: CHAT_REPLY_PROMPT_VERSION },
		});
	} catch (error) {
		if (error instanceof AiRefusalError) {
			return Response.json({ error: 'refused', category: error.category }, { status: 422 });
		}
		console.error('[ai/chat-reply] błąd:', error.message);
		return Response.json({ error: 'generation_failed' }, { status: 500 });
	}
}
