import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getCookieRouteHandler, verifyJwt } from '@/lib/auth';

export async function GET(request) {
  try {
    await connectToDb();

    const at = await getCookieRouteHandler('accessToken');
    if (!at) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = verifyJwt(at, process.env.JWT_SECRET);
    } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(decoded.userId).select('username email image');
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      userId: user.id,
      username: user.username,
      email: user.email,
      image: user.image,
    }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('me error:', err);
    }
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

