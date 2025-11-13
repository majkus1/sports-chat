import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';

export async function POST(request) {
  const body = await request.json();
  const { username, content, chatId } = body || {};

  try {
    await connectToDb();

    let chat = await PrivateChat.findOne({ chatId });

    if (!chat) {
      chat = new PrivateChat({ chatId, messages: [] });
    }

    const newMessage = {
      username: username,
      content: content,
      timestamp: new Date(),
    };

    chat.messages.push(newMessage);
    await chat.save();

    return Response.json({ success: true, message: 'Wiadomość zapisana pomyślnie.' }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error saving private message:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas zapisywania wiadomości.' }, { status: 500 });
  }
}

