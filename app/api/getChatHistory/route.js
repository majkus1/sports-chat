import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * Lista rozmów prywatnych wraz z liczbą nieprzeczytanych wiadomości.
 *
 * Rozmowy szukamy po polach `user1`/`user2`, a nie po wzorcu w `chatId`. Poprzednia
 * wersja robiła `chatId: /nazwa/i`, czyli dopasowanie po PODCIĄGU — użytkownik „ala"
 * dostawał w swojej liście rozmowę „ala2_bob", w której nie brał udziału. Dodatkowo
 * takie zapytanie nie mogło skorzystać z indeksu.
 */
export async function GET() {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = session.username;

  await connectToDb();

  try {
    const chats = await PrivateChat.find({
      $or: [{ user1: username }, { user2: username }],
    }).lean();

    const chatHistory = chats
      .map((chat) => {
        const otherUser = chat.user1 === username ? chat.user2 : chat.user1;
        if (!otherUser) return null;

        // `lean()` oddaje mapę jako zwykły obiekt.
        const lastReadAt = chat.lastRead?.[username]
          ? new Date(chat.lastRead[username]).getTime()
          : 0;

        let unreadCount = 0;
        let lastMessageDate = null;
        let lastMessagePreview = null;

        for (const message of chat.messages || []) {
          if (message.username !== otherUser) continue;
          const at = new Date(message.timestamp).getTime();

          if (!lastMessageDate || at > new Date(lastMessageDate).getTime()) {
            lastMessageDate = message.timestamp;
            lastMessagePreview = String(message.content || '').slice(0, 80);
          }
          if (at > lastReadAt) unreadCount += 1;
        }

        return { username: otherUser, lastMessageDate, lastMessagePreview, unreadCount };
      })
      .filter(Boolean)
      // Rozmowy z nieprzeczytanymi na górze, potem od najświeższej.
      .sort((a, b) => {
        if (Boolean(b.unreadCount) !== Boolean(a.unreadCount)) return b.unreadCount - a.unreadCount;
        return new Date(b.lastMessageDate || 0) - new Date(a.lastMessageDate || 0);
      });

    return Response.json(chatHistory, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching chat history:', error);
    }
    return Response.json({ error: 'Błąd podczas pobierania historii czatów.' }, { status: 500 });
  }
}
