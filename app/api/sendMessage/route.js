import connectToDb from '@/lib/db';
import Message from '@/models/Message';
import { getAuthenticatedUser } from '@/lib/auth';
import { CHAT_ID_PATTERN, MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';

export async function POST(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // Socket ma własny limit (10/3 s), ale ta trasa była zupełnie niechroniona.
  const rate = await checkRateLimit({
    key: `send-message:user:${session.userId}`,
    limit: 30,
    windowSeconds: 10,
    failOpen: true,
  });
  if (!rate.allowed) return tooManyRequests(rate.retryAfter);

  const body = await request.json();
  const { content, chatId, clientMsgId } = body || {};

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

  const safeClientMsgId =
    typeof clientMsgId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(clientMsgId)
      ? clientMsgId
      : null;

  try {
    await connectToDb();

    const newMessage = new Message({
      username: session.username,
      userId: session.userId,
      content: safeContent,
      chatId,
      // Tylko gdy klient przysłał identyfikator — indeks unikalności obejmuje wyłącznie stringi.
      ...(safeClientMsgId ? { clientMsgId: safeClientMsgId } : {}),
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
    // Ta sama wiadomość dotarła już socketem — traktujemy jako sukces, nie duplikujemy.
    if (error?.code === 11000 && safeClientMsgId) {
      return Response.json(
        { success: true, message: 'Wiadomość już zapisana.', username: session.username },
        { status: 200 }
      );
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('Error saving message:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas zapisywania wiadomości.' }, { status: 500 });
  }
}
