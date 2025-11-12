import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';

export async function POST(request) {
  const body = await request.json();
  const { user1, user2 } = body || {};

  const chatId = [user1, user2].sort().join('_');

  try {
    await connectToDb();

    let chat = await PrivateChat.findOne({ chatId });
    if (!chat) {
      chat = new PrivateChat({ user1, user2, chatId, messages: [] });
      await chat.save();
    }

    return Response.json({ success: true, chatId: chat.chatId }, { status: 200 });
  } catch (error) {
    console.error('Error creating private chat:', error);
    return Response.json({ success: false, message: 'Błąd podczas tworzenia czatu.' }, { status: 500 });
  }
}

