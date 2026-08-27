import mongoose from 'mongoose';

/**
 * Prywatna rozmowa użytkownika z asystentem przy konkretnym meczu.
 *
 * To co innego niż `@AI` w czacie pokoju: tam pytanie i odpowiedź widzą wszyscy i trafiają
 * do wspólnej historii. Tutaj wątek należy wyłącznie do jednego konta — pytania bywają
 * naiwne albo dotyczą własnego typowania i nie każdy chce zadawać je publicznie.
 *
 * Rozmowa żyje razem z zainteresowaniem meczem, więc rekord wygasa po 30 dniach.
 */
const messageSchema = new mongoose.Schema(
	{
		role: { type: String, enum: ['user', 'assistant'], required: true },
		content: { type: String, required: true },
		at: { type: Date, default: Date.now },
	},
	{ _id: false }
);

const aiConversationSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		fixtureId: { type: String, required: true },
		language: { type: String, enum: ['pl', 'en'], default: 'pl' },
		messages: { type: [messageSchema], default: [] },
		expiresAt: {
			type: Date,
			default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		},
	},
	{ timestamps: true }
);

// Jeden wątek na użytkownika, mecz i język — inaczej przełączenie języka mieszałoby rozmowy.
aiConversationSchema.index({ userId: 1, fixtureId: 1, language: 1 }, { unique: true });
aiConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AiConversation ||
	mongoose.model('AiConversation', aiConversationSchema);
