import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '../globals.css';
import '../../styles/All.scss';
import '../../styles/LoginModal.scss';
import { UserProvider } from '@/context/UserContext';
import { AlertProvider } from '@/context/AlertContext';
import { SocketProvider } from '@/context/SocketContext';
import { AnalysisProvider } from '@/context/AnalysisContext';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  // In Next.js 15, params must be awaited
  const { locale } = await params;
  
  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AlertProvider>
            <UserProvider>
              <SocketProvider>
                <AnalysisProvider>
                  {children}
                </AnalysisProvider>
              </SocketProvider>
            </UserProvider>
          </AlertProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

