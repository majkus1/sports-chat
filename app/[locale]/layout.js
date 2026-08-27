import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
// Stary SCSS PRZED globals.css: utility Tailwinda są poza warstwą kaskadową, więc przy
// równej specyficzności wygrywa to, co załadowane później. Odwrotna kolejność sprawiała,
// że reguły z All.scss nadpisywały klasy Tailwinda. Szczegóły w komentarzu w globals.css.
import '../../styles/All.scss';
import '../../styles/LoginModal.scss';
import '../globals.css';
import { UserProvider } from '@/context/UserContext';
import { AlertProvider } from '@/context/AlertContext';
import { SocketProvider } from '@/context/SocketContext';
import { UnreadProvider } from '@/context/UnreadContext';
import { AnalysisProvider } from '@/context/AnalysisContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ThemeScript from '@/components/theme/ThemeScript';
import { LOCALES, SITE_URL, siteFor } from '@/lib/seo/config';
import AgeGate from '@/components/consent/AgeGate';
import CookieBanner from '@/components/consent/CookieBanner';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Metadane wspólne dla całego serwisu.
 *
 * `metadataBase` jest tu obowiązkowy: bez niego Next buduje adresy Open Graph względem
 * bieżącego żądania, więc podgląd udostępnianego odnośnika wskazuje na `localhost`.
 *
 * `title.template` sprawia, że każda strona podaje wyłącznie swój tytuł, a nazwa serwisu
 * dokleja się sama — inaczej połowa tytułów byłaby zdublowana, a połowa bez marki.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const site = siteFor(locale);
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}`]));
  languages['x-default'] = `${SITE_URL}/pl`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${site.name} — ${site.tagline}`,
      template: `%s · ${site.name}`,
    },
    description: site.description,
    applicationName: site.name,
    alternates: { canonical: `${SITE_URL}/${locale}`, languages },
    openGraph: {
      type: 'website',
      siteName: site.name,
      locale: site.ogLocale,
      url: `${SITE_URL}/${locale}`,
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
    // Motyw jasny i ciemny mają różne kolory paska adresu na urządzeniach mobilnych.
    other: { 'theme-color': '#173b45' },
  };
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
    // suppressHydrationWarning: ThemeScript dopisuje klasę i data-theme do <html> przed
    // hydracją, więc znaczniki serwera i klienta różnią się celowo.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <AlertProvider>
              <UserProvider>
                <SocketProvider>
                  {/* Nieprzeczytane potrzebują socketu i sesji, a plakietkę pokazuje
                      nagłówek widoczny na każdej stronie — stąd tak wysoko. */}
                  <UnreadProvider>
                    <AnalysisProvider>
                      {children}
                      {/* Bramka wieku i baner zgód stoją nad treścią na każdej stronie,
                          więc ich miejsce jest w układzie, a nie w pojedynczych widokach. */}
                      <AgeGate />
                      <CookieBanner />
                    </AnalysisProvider>
                  </UnreadProvider>
                </SocketProvider>
              </UserProvider>
            </AlertProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

