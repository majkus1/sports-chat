import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  try {
    await connectToDb();

    const chat = await PrivateChat.findOne({ chatId });
    if (!chat) {
      return Response.json({ success: false, message: 'Czat nie istnieje.' }, { status: 404 });
    }

    return Response.json(chat.messages, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching private messages:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas pobierania wiadomości.' }, { status: 500 });
  }
}

