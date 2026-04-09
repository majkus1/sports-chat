import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import User from '@/models/User';
import { getAuthenticatedUser, ensureString } from '@/lib/auth';
import { privateChatIdForUsers } from '@/lib/chatConstraints';

export async function POST(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { user1, user2 } = body || {};

  if (!ensureString(user1, 32) || !ensureString(user2, 32)) {
    return Response.json({ success: false, message: 'Invalid data' }, { status: 400 });
  }

  const a = user1.trim();
  const b = user2.trim();
  if (a !== session.username && b !== session.username) {
    return Response.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectToDb();

    const [u1, u2] = await Promise.all([User.findOne({ username: a }), User.findOne({ username: b })]);
    if (!u1 || !u2) {
      return Response.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const chatId = privateChatIdForUsers(u1.username, u2.username);

    let chat = await PrivateChat.findOne({ chatId });
    if (!chat) {
      chat = new PrivateChat({ user1: u1.username, user2: u2.username, chatId, messages: [] });
      await chat.save();
    }

    return Response.json({ success: true, chatId: chat.chatId }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating private chat:', error);
    }
    return Response.json({ success: false, message: 'Błąd podczas tworzenia czatu.' }, { status: 500 });
  }
}
