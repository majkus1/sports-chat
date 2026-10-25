import AppShell from '@/components/layout/AppShell';
import MyCoupons from '@/components/coupons/MyCoupons';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * „Moje kupony" — własne kupony z kreatora (`components/coupons/MyCoupons.jsx`, trasa `/api/coupons/mine`).
 *
 * Strona konta, nie treść do wyszukiwarki: `noindex` tutaj i blokada w `robots.txt`, poza mapą witryny.
 * Treść zależy od sesji, więc renderuje ją klient — serwer daje tylko metadane i powłokę.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/moje-kupony', title: locale === 'en' ? 'My coupons' : 'Moje kupony', noindex: true });
}

export default async function Page({ params }) {
	const { locale } = await params;
	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<MyCoupons locale={locale} />
		</AppShell>
	);
}
