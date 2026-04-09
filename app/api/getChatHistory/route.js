import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import { getAuthenticatedUser } from '@/lib/auth';
import { escapeRegExp } from '@/lib/chatConstraints';

export async function GET(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = session.username;

  await connectToDb();

  try {
    const chats = await PrivateChat.find({
      chatId: new RegExp(escapeRegExp(username), 'i'),
    });

    const chatHistory = chats.map((chat) => {
      const participants = chat.chatId.split('_');
      const otherUser = participants.find((participant) => participant !== username);

      const lastMessageByOtherUser = chat.messages
        .filter((message) => message.username === otherUser)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      return {
        username: otherUser,
        lastMessageDate: lastMessageByOtherUser ? lastMessageByOtherUser.timestamp : null,
      };
    });

    return Response.json(chatHistory, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching chat history:', error);
    }
    return Response.json({ error: 'Błąd podczas pobierania historii czatów.' }, { status: 500 });
  }
}
