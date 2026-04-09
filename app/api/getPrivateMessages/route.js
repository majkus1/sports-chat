import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import User from '@/models/User';
import { getAuthenticatedUser, ensureString } from '@/lib/auth';
import { privateChatIdForUsers } from '@/lib/chatConstraints';

export async function GET(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const peer = searchParams.get('peer');

  if (!ensureString(peer || '', 32)) {
    return Response.json({ success: false, message: 'Missing or invalid peer' }, { status: 400 });
  }

  const peerNorm = peer.trim();
  if (peerNorm === session.username) {
    return Response.json({ success: false, message: 'Invalid peer' }, { status: 400 });
  }

  try {
    await connectToDb();

    const peerUser = await User.findOne({ username: peerNorm }).select('username');
    if (!peerUser) {
      return Response.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const chatId = privateChatIdForUsers(session.username, peerUser.username);

    const chat = await PrivateChat.findOne({ chatId });
    if (!chat) {
      return Response.json([], { status: 200 });
    }

    return Response.json(chat.messages, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching private messages:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas pobierania wiadomości.' }, { status: 500 });
  }
}
