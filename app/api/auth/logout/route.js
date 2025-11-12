import { clearAuthCookiesRouteHandler } from '@/lib/auth';

export async function POST(request) {
  await clearAuthCookiesRouteHandler();
  return Response.json({ message: 'Wylogowano' }, { status: 200 });
}

