import connectToDb from '@/lib/db';
import AiConversation from '@/models/AiConversation';
import AssistantConversation, { MAX_PER_USER, titleFrom } from '@/models/AssistantConversation';
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
 * ROZMOWY JAK W CHATGPT. Wiele rozmów na użytkownika (`AssistantConversation`), każda
 * z tytułem z pierwszego pytania; lista, otwieranie, nowa rozmowa, usuwanie. Pierwsza
 * wersja trzymała jeden wątek w `AiConversation` pod sztucznym `fixtureId` — przy pierwszym
 * wejściu po zmianie taki wątek jest przenoszony do nowej kolekcji jako zwykła rozmowa,
 * żeby nikt nie stracił historii.
 */

const LEGACY_THREAD_ID = 'assistant';
const CONTEXT_SIZE = 12;
const KEEP_MESSAGES = 60;

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

const OBJECT_ID = /^[a-f0-9]{24}$/;

/**
 * Stary jednowątkowy zapis → zwykła rozmowa w nowej kolekcji. Raz, przy pierwszym wejściu.
 * Bez tego zmiana modelu danych kasowałaby ludziom historię, którą właśnie obiecujemy.
 */
async function migrateLegacyThread(userId, language) {
	const legacy = await AiConversation.findOne({ userId, fixtureId: LEGACY_THREAD_ID, language }).lean();
	if (!legacy?.messages?.length) return;
	const pierwsze = legacy.messages.find((m) => m.role === 'user')?.content;
	await AssistantConversation.create({
		userId,
		language,
		title: titleFrom(pierwsze || (language === 'en' ? 'Earlier conversation' : 'Wcześniejsza rozmowa')),
		messages: legacy.messages.slice(-KEEP_MESSAGES),
	});
	await AiConversation.deleteOne({ _id: legacy._id });
}

/** Lista rozmów (bez `id`) albo jedna rozmowa z wiadomościami (`?id=`). */
export async function GET(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const language = searchParams.get('language') === 'en' ? 'en' : 'pl';
	const id = searchParams.get('id');

	await connectToDb();

	if (id) {
		if (!OBJECT_ID.test(id)) return Response.json({ error: 'not_found' }, { status: 404 });
		const rozmowa = await AssistantConversation.findOne({ _id: id, userId: session.userId })
			.select('title messages updatedAt')
			.lean();
		if (!rozmowa) return Response.json({ error: 'not_found' }, { status: 404 });
		return Response.json({
			id: String(rozmowa._id),
			title: rozmowa.title,
			updatedAt: rozmowa.updatedAt,
			messages: rozmowa.messages.slice(-KEEP_MESSAGES),
		});
	}

	await migrateLegacyThread(session.userId, language);
	const lista = await AssistantConversation.find({ userId: session.userId, language })
		.select('title updatedAt messages')
		.sort({ updatedAt: -1 })
		.limit(MAX_PER_USER)
		.lean();

	return Response.json({
		conversations: lista.map((r) => ({
			id: String(r._id),
			title: r.title,
			updatedAt: r.updatedAt,
			messageCount: r.messages.length,
		})),
	});
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
	const conversationId = OBJECT_ID.test(String(body?.conversationId || '')) ? String(body.conversationId) : null;
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

		// Rozmowa musi należeć do pytającego — obcy identyfikator to „nie ma takiej", nie cudza historia.
		const rozmowa = conversationId
			? await AssistantConversation.findOne({ _id: conversationId, userId: session.userId }).select('messages').lean()
			: null;
		if (conversationId && !rozmowa) return Response.json({ error: 'not_found' }, { status: 404 });

		const history = (rozmowa?.messages || [])
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

		let zapisana;
		if (rozmowa) {
			zapisana = await AssistantConversation.findOneAndUpdate(
				{ _id: conversationId, userId: session.userId },
				{ $push: { messages: { $each: appended, $slice: -KEEP_MESSAGES } } },
				{ new: true, projection: { title: 1 } }
			).lean();
		} else {
			zapisana = await AssistantConversation.create({
				userId: session.userId,
				language,
				title: titleFrom(question),
				messages: appended,
			});
			// Sufit rozmów na użytkownika: najstarsze odpadają, żeby historia nie rosła bez końca.
			const nadmiar = await AssistantConversation.find({ userId: session.userId })
				.sort({ updatedAt: -1 })
				.skip(MAX_PER_USER)
				.select('_id')
				.lean();
			if (nadmiar.length) {
				await AssistantConversation.deleteMany({ _id: { $in: nadmiar.map((r) => r._id) } });
			}
		}

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
			conversationId: String(zapisana._id),
			title: zapisana.title,
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

/** Usunięcie jednej rozmowy (`?id=`). */
export async function DELETE(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const id = searchParams.get('id');
	if (!OBJECT_ID.test(String(id || ''))) return Response.json({ error: 'not_found' }, { status: 404 });

	await connectToDb();
	const wynik = await AssistantConversation.deleteOne({ _id: id, userId: session.userId });
	return Response.json({ ok: wynik.deletedCount === 1 });
}
