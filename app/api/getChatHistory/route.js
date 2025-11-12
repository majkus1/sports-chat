import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return Response.json({ error: 'Missing username parameter' }, { status: 400 });
  }

  await connectToDb();

  try {
    const chats = await PrivateChat.find({
      chatId: new RegExp(username, 'i'),
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
    console.error('Error fetching chat history:', error);
    return Response.json({ error: 'Błąd podczas pobierania historii czatów.' }, { status: 500 });
  }
}

