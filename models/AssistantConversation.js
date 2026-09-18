import mongoose from 'mongoose';

/**
 * Rozmowy z asystentem całej oferty — wiele na użytkownika, z historią jak w ChatGPT.
 *
 * Osobna kolekcja od `AiConversation` celowo: tamta jest przywiązana do meczu (jeden wątek
 * na użytkownika, mecz i język, znika po 30 dniach), a tu chodzi o coś odwrotnego —
 * dowolnie wiele rozmów, do których się wraca. Wciskanie tego w tamten schemat przez
 * sztuczne identyfikatory meczu było pierwszą wersją i wytrzymało tydzień.
 *
 * BEZ WYGASANIA, ZA TO Z SUFITEM. Historia ma zostać, ale nie w nieskończoność: powyżej
 * `MAX_PER_USER` rozmów najstarsze odpadają przy zapisie nowej. Wiadomości w rozmowie
 * przycina `$slice` przy dopisywaniu — patrz trasa.
 *
 * `title` powstaje z pierwszego pytania (przycięte), bez modelu językowego — tytuł ma
 * pozwolić odnaleźć rozmowę na liście, a nie być ładny.
 */

export const MAX_PER_USER = 50;
export const MAX_TITLE_LENGTH = 60;

const messageSchema = new mongoose.Schema(
	{
		role: { type: String, enum: ['user', 'assistant'], required: true },
		content: { type: String, required: true },
		at: { type: Date, default: Date.now },
	},
	{ _id: false }
);

const assistantConversationSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		language: { type: String, enum: ['pl', 'en'], default: 'pl' },
		title: { type: String, required: true, maxlength: MAX_TITLE_LENGTH },
		messages: { type: [messageSchema], default: [] },
	},
	{ timestamps: true }
);

// Lista rozmów czyta zawsze po właścicielu, od ostatnio używanej.
assistantConversationSchema.index({ userId: 1, updatedAt: -1 });

/** Tytuł z pierwszego pytania: jedna linia, bez nadmiarowych spacji, przycięta z wielokropkiem. */
export function titleFrom(question) {
	const jednaLinia = String(question || '').replace(/\s+/g, ' ').trim();
	if (jednaLinia.length <= MAX_TITLE_LENGTH) return jednaLinia || '…';
	return `${jednaLinia.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export default mongoose.models.AssistantConversation ||
	mongoose.model('AssistantConversation', assistantConversationSchema);
