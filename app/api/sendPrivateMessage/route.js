import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import User from '@/models/User';
import { getAuthenticatedUser, ensureString } from '@/lib/auth';
import { MAX_CHAT_MSG_LEN, privateChatIdForUsers } from '@/lib/chatConstraints';

export async function POST(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { content, peer } = body || {};

  if (!ensureString(peer, 32)) {
    return Response.json({ success: false, message: 'Invalid peer' }, { status: 400 });
  }
  const peerNorm = peer.trim();
  if (peerNorm === session.username) {
    return Response.json({ success: false, message: 'Invalid peer' }, { status: 400 });
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

    const peerUser = await User.findOne({ username: peerNorm }).select('_id username');
    if (!peerUser) {
      return Response.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const chatId = privateChatIdForUsers(session.username, peerUser.username);

    let chat = await PrivateChat.findOne({ chatId });

    if (!chat) {
      chat = new PrivateChat({
        user1: session.username,
        user2: peerUser.username,
        chatId,
        messages: [],
      });
    }

    const newMessage = {
      username: session.username,
      content: safeContent,
      timestamp: new Date(),
    };

    chat.messages.push(newMessage);
    await chat.save();

    return Response.json(
      {
        success: true,
        message: 'Wiadomość zapisana pomyślnie.',
        chatId,
        username: session.username,
      },
      { status: 200 }
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error saving private message:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas zapisywania wiadomości.' }, { status: 500 });
  }
}
