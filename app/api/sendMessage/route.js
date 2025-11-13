import connectToDb from '@/lib/db';
import Message from '@/models/Message';

export async function POST(request) {
  const body = await request.json();
  const { username, content, chatId } = body || {};

  try {
    await connectToDb();

    const newMessage = new Message({
      username: username,
      content: content,
      chatId: chatId,
    });
    await newMessage.save();

    return Response.json({ success: true, message: 'Wiadomość zapisana pomyślnie.' }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error saving message:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas zapisywania wiadomości.' }, { status: 500 });
  }
}

