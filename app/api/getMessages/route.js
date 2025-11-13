import connectToDb from '@/lib/db';
import Message from '@/models/Message';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  try {
    await connectToDb();

    const messages = await Message.find({ chatId: chatId });
    return Response.json(messages, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching messages:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas pobierania wiadomości.' }, { status: 500 });
  }
}

