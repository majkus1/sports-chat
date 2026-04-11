import connectToDb from '@/lib/db';
import Message from '@/models/Message';
import { getAuthenticatedUser } from '@/lib/auth';
import { CHAT_ID_PATTERN, MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';

export async function POST(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { content, chatId } = body || {};

  if (typeof chatId !== 'string' || !CHAT_ID_PATTERN.test(chatId)) {
    return Response.json({ success: false, message: 'Invalid chatId' }, { status: 400 });
  }
  if (typeof content !== 'string') {
    return Response.json({ success: false, message: 'Invalid content' }, { status: 400 });
  }

  const safeContent = content.slice(0, MAX_CHAT_MSG_LEN).trim();
  if (!safeContent) {
    return Response.json({ success: false, message: 'Empty message' }, { status: 400 });
  }

  try {
    await connectToDb();

    const newMessage = new Message({
      username: session.username,
      content: safeContent,
      chatId,
    });
    await newMessage.save();

    return Response.json(
      {
        success: true,
        message: 'Wiadomość zapisana pomyślnie.',
        username: session.username,
      },
      { status: 200 }
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error saving message:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas zapisywania wiadomości.' }, { status: 500 });
  }
}
