import connectToDb from '@/lib/db';
import User from '@/models/User';
import { clearAuthCookiesRouteHandler, getCookieRouteHandler, verifyJwt } from '@/lib/auth';

export async function POST() {
  // Samo skasowanie ciasteczek zostawiało ważny refreshTokenHash w bazie — sesja dawała się
  // wznowić, gdyby ktoś przechwycił token. Czyścimy go zanim usuniemy ciasteczka.
  try {
    const accessToken = await getCookieRouteHandler('accessToken');
    if (accessToken) {
      const decoded = verifyJwt(accessToken, process.env.JWT_SECRET);
      await connectToDb();
      await User.updateOne({ _id: decoded.userId }, { $set: { refreshTokenHash: null } });
    }
  } catch (error) {
    // Wygasły lub uszkodzony token nie może zablokować wylogowania.
    if (process.env.NODE_ENV === 'development') {
      console.error('logout cleanup error:', error);
    }
  }

  await clearAuthCookiesRouteHandler();
  return Response.json({ message: 'Wylogowano' }, { status: 200 });
}
