import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { escapeRegExp } from '@/lib/chatConstraints';

export async function GET(request) {
  const session = await getAuthenticatedUser();
  if (!session) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  await connectToDb();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query || typeof query !== 'string' || query.trim().length < 1) {
    return Response.json({ success: false, message: 'Query parameter is required.' }, { status: 400 });
  }

  if (query.length > 64) {
    return Response.json({ success: false, message: 'Query too long.' }, { status: 400 });
  }

  try {
    const safe = escapeRegExp(query.trim());
    const users = await User.find({ username: new RegExp(safe, 'i') }).select('username -_id').limit(25);
    return Response.json({ success: true, users }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error searching users:', error);
    }
    return Response.json({ success: false, message: 'Internal Server Error.' }, { status: 500 });
  }
}
