import connectToDb from '@/lib/db';
import AiConversation from '@/models/AiConversation';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkQuota, consumeQuota, recordUsage } from '@/lib/billing/entitlements';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { runTools, AiRefusalError } from '@/lib/ai';
import { MODEL_CHAT, MAX_TOKENS_CHAT } from '@/lib/ai/config';
import { assistantSystemPrompt, ASSISTANT_PROMPT_VERSION } from '@/lib/ai/prompts/assistant';
import { TOOLS, makeExecutor } from '@/lib/assistant/tools';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { localDate } from '@/lib/time';

export const maxDuration = 120;

/**
 * Asystent całej oferty — jedna rozmowa o wszystkich meczach, typach i skuteczności.
 *
 * Różni się od `/api/ai/ask` jednym: tamten dostaje pakiet JEDNEGO meczu w kontekście,
 * ten nie dostaje żadnych danych z góry. Zamiast tego ma narzędzia i sam pyta o to, czego
 * potrzebuje — patrz `lib/assistant/tools.js`. Reszta jest wspólna: sesja, limit pytań
 * (`aiChat`), próg wydatków, zapis rozmowy, dziennik użycia.
 *
 * WĄTEK ROZMOWY. `AiConversation` wymaga `fixtureId`, bo powstał dla rozmów o meczu.
 * Asystent nie ma meczu, więc używa stałej wartości `'assistant'` w tym polu — jeden wątek
 * na użytkownika i język, ten sam mechanizm przycinania i wygasania. Świadomie bez zmiany
 * schematu: pole jest napisem, a osobna kolekcja dla jednej różnicy byłaby przesadą.
 */

const THREAD_ID = 'assistant';
const CONTEXT_SIZE = 12;
const KEEP_MESSAGES = 40;

const MESSAGES = {
	pl: {
		limit: 'Wykorzystałeś miesięczny limit pytań do asystenta w swoim planie.',
		busy: 'Asystent jest chwilowo niedostępny. Spróbuj za chwilę.',
		refused: 'Asystent nie mógł odpowiedzieć na to pytanie.',
		failed: 'Coś poszło nie tak. Spróbuj ponownie.',
	},
	en: {
		limit: 'You have used your plan’s monthly assistant question limit.',
		busy: 'The assistant is temporarily unavailable. Please try again shortly.',
		refused: 'The assistant could not answer that question.',
		failed: 'Something went wrong. Please try again.',
	},
};

function readLanguage(body) {
	return body?.language === 'en' ? 'en' : 'pl';
}

/** Historia rozmowy do pokazania po wejściu na stronę. */
export async function GET(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const language = searchParams.get('language') === 'en' ? 'en' : 'pl';

	await connectToDb();
	const thread = await AiConversation.findOne({ userId: session.userId, fixtureId: THREAD_ID, language })
		.select('messages')
		.lean();

	return Response.json({ messages: (thread?.messages || []).slice(-KEEP_MESSAGES) });
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

	const question = String(body?.question || '').trim();
	const language = readLanguage(body);
	const locale = language;
	const t = MESSAGES[language];

	if (!question) return Response.json({ error: 'empty_question' }, { status: 400 });
	if (question.length > MAX_CHAT_MSG_LEN) {
		return Response.json({ error: 'question_too_long' }, { status: 400 });
	}

	try {
		await connectToDb();

		const spend = await checkSpendCap();
		if (!spend.allowed) {
			return Response.json({ error: 'temporarily_unavailable', message: t.busy }, { status: 503 });
		}

		const user = await User.findById(session.userId)
			.select('plan planStatus planValidUntil role credits createdAt')
			.lean();

		const quota = await checkQuota({ kind: 'aiChat', user, userId: session.userId });
		if (!quota.allowed) {
			return Response.json(
				{ error: 'limit', message: t.limit, limit: quota.limit, used: quota.used, plan: quota.plan },
				{ status: 429 }
			);
		}

		const thread = await AiConversation.findOne({ userId: session.userId, fixtureId: THREAD_ID, language })
			.select('messages')
			.lean();
		const history = (thread?.messages || [])
			.slice(-CONTEXT_SIZE)
			.map((m) => ({ role: m.role, content: m.content }));

		const { text, meta, toolCalls } = await runTools({
			model: MODEL_CHAT,
			system: assistantSystemPrompt({
				language,
				locale,
				today: localDate(),
			}),
			messages: [...history, { role: 'user', content: question }],
			tools: TOOLS,
			execute: makeExecutor({ userId: session.userId, user, language }),
			maxTokens: MAX_TOKENS_CHAT,
			/*
			 * Pełny model, nie szybki. Czat meczu idzie na szybkim, bo tam pytanie i kontekst
			 * są proste. Tu model musi trzymać się reguł promptu (np. zacząć od zdania o tym,
			 * że pewniak to nie typ) i sam decydować o narzędziach — szybki model gubił
			 * te reguły. Na wejściu pełny gpt-5.5 jest przy tym tańszy od gpt-4o.
			 */
			fast: false,
		});

		if (!text) return Response.json({ error: 'empty_reply', message: t.failed }, { status: 502 });

		const now = new Date();
		const appended = [
			{ role: 'user', content: question, at: now },
			{ role: 'assistant', content: text, at: new Date(now.getTime() + 1) },
		];

		await AiConversation.updateOne(
			{ userId: session.userId, fixtureId: THREAD_ID, language },
			{
				$push: { messages: { $each: appended, $slice: -KEEP_MESSAGES } },
				$set: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
			},
			{ upsert: true }
		);

		// Licznik i dziennik dopiero po udanej odpowiedzi — nieudana nie kosztuje.
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
		});

		return Response.json({
			messages: appended,
			// Które narzędzia poszły w ruch — interfejs pokazuje to jako „sprawdziłem…".
			tools: toolCalls.map((c) => c.name),
			meta: { promptVersion: ASSISTANT_PROMPT_VERSION },
		});
	} catch (error) {
		if (error instanceof AiRefusalError) {
			return Response.json({ error: 'refused', message: t.refused }, { status: 422 });
		}
		console.error('[assistant] błąd:', error.message);
		return Response.json({ error: 'failed', message: t.failed }, { status: 500 });
	}
}

/** Wyczyszczenie wątku — „zacznij od nowa" w interfejsie. */
export async function DELETE(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const language = searchParams.get('language') === 'en' ? 'en' : 'pl';

	await connectToDb();
	await AiConversation.deleteOne({ userId: session.userId, fixtureId: THREAD_ID, language });
	return Response.json({ ok: true });
}
