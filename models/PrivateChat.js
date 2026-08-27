const mongoose = require('mongoose');

const privateChatSchema = new mongoose.Schema({
    user1: String,
    user2: String,
    chatId: String,
    messages: [{
        username: String,
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    /**
     * Kiedy każdy z rozmówców ostatnio otworzył tę rozmowę.
     *
     * Klucz to nazwa użytkownika, wartość to moment odczytu. Liczba nieprzeczytanych
     * to po prostu wiadomości drugiej strony nowsze od tej daty — bez flagi przy każdej
     * wiadomości, więc oznaczenie rozmowy jako przeczytanej to jeden zapis, a nie
     * aktualizacja całej tablicy.
     */
    lastRead: {
        type: Map,
        of: Date,
        default: () => new Map()
    }
});

/** Lista rozmów pyta zawsze po uczestniku — bez indeksu to skan całej kolekcji. */
privateChatSchema.index({ user1: 1 });
privateChatSchema.index({ user2: 1 });

const PrivateChat = mongoose.models.PrivateChat || mongoose.model('PrivateChat', privateChatSchema);

module.exports = PrivateChat;
