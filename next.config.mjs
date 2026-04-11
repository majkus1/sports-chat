import createNextIntlPlugin from 'next-intl/plugin';
 
const withNextIntl = createNextIntlPlugin('./i18n/request.js');
 
/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Google Identity Services (popup) + domyślne COOP — bez tego w konsoli: postMessage blocked */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};
 
export default withNextIntl(nextConfig);

