/**
 * Definicja schematu wiadomości w CommonJS, bo korzystają z niej dwa światy:
 *  - Next.js (`models/Message.js`, ESM),
 *  - samodzielny serwer Socket.IO (`server.js`, CJS), który od teraz sam zapisuje wiadomości.
 *
 * Dzięki temu jedno miejsce definiuje pola i indeksy — bez kopii, która rozjedzie się po miesiącu.
 */

const AUTHOR_TYPES = ['user', 'ai', 'system'];

/** @param {import('mongoose')} mongoose */
function createMessageSchema(mongoose) {
	const schema = new mongoose.Schema(
		{
			chatId: { type: String, required: true },
			username: { type: String, required: true },

			// Dotychczas wiadomość znała tylko nick. Bez userId nie da się powiązać jej z kontem
			// (moderacja, statystyki, limity), a nick można zmienić.
			userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

			authorType: { type: String, enum: AUTHOR_TYPES, default: 'user' },
			content: { type: String, required: true },

			// Identyfikator nadany przez klienta przed wysyłką — pozwala rozpoznać wiadomość
			// wysłaną ponownie po utracie połączenia zamiast zapisywać ją drugi raz.
			// Bez `default`: gdy klient go nie poda, pole ma nie istnieć (patrz indeks niżej).
			clientMsgId: { type: String },

			replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
			mentions: { type: [String], default: [] },

			reactions: {
				type: [
					{
						_id: false,
						emoji: { type: String, required: true },
						userIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
					},
				],
				default: [],
			},

			// Wypełniane tylko dla authorType === 'ai' — pozwala rozliczyć koszt odpowiedzi.
			aiMeta: {
				type: {
					_id: false,
					model: String,
					promptVersion: String,
					tokensIn: Number,
					tokensOut: Number,
					costUsd: Number,
					snapshotId: mongoose.Schema.Types.ObjectId,
				},
				default: undefined,
			},

			editedAt: { type: Date, default: null },
			deletedAt: { type: Date, default: null },

			// Zostaje pod starą nazwą — cały front i istniejące dokumenty sortują po tym polu.
			timestamp: { type: Date, default: Date.now },
		},
		{ timestamps: true }
	);

	// Historia pokoju czytana jest zawsze jako "najnowsze N" — bez tego indeksu każdy odczyt
	// skanował całą kolekcję.
	schema.index({ chatId: 1, timestamp: -1 });

	// Indeks częściowy, nie `sparse`: sparse pomija tylko dokumenty BEZ pola, a `null` jest
	// wartością obecną — dwie wiadomości z clientMsgId: null łamałyby unikalność.
	schema.index(
		{ clientMsgId: 1 },
		{ unique: true, partialFilterExpression: { clientMsgId: { $type: 'string' } } }
	);

	return schema;
}

module.exports = createMessageSchema;
module.exports.AUTHOR_TYPES = AUTHOR_TYPES;
