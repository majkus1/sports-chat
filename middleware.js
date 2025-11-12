import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse } from 'next/server';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Redirect /reset-password to /pl/reset-password (for old email links)
  if (pathname === '/reset-password') {
    const url = request.nextUrl.clone();
    url.pathname = `/pl/reset-password`;
    // Preserve query parameters (like token)
    return NextResponse.redirect(url);
  }
  
  // Use the default next-intl middleware for other routes
  return intlMiddleware(request);
}

export const config = {
  // Match only internationalized pathnames and reset-password
  matcher: ['/', '/(pl|en)/:path*', '/reset-password']
};

