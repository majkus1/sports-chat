import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  try {
    await connectToDb();

    /*
     * `getAuthenticatedUser` zamiast samego `verifyJwt`.
     *
     * Ta trasa odpowiada na pytanie „czy jestem zalogowany" i zwraca adres e-mail konta.
     * Bez sprawdzenia `tokenVersion` przeglądarka z tokenem sprzed resetu hasła wciąż
     * pokazywała zalogowaną sesję razem z adresem — czyli reset hasła nie odcinał tego,
     * kogo miał odciąć.
     */
    const session = await getAuthenticatedUser();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(session.userId).select('username email image role');
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      userId: user.id,
      username: user.username,
      email: user.email,
      image: user.image,
      // Własna rola — interfejs pokazuje administratorowi skróty (np. post na X).
      // Uprawnień nie daje: każda trasa admina sprawdza rolę w bazie sama.
      role: user.role || 'user',
      // Kiedy wygasa token dostępu — klient odświeża go zawczasu, także po uśpieniu laptopa.
      accessExpiresAt: session.accessExpiresAt ?? null,
    }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('me error:', err);
    }
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

