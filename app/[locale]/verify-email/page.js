import VerifyEmailClient from '@/components/auth/VerifyEmailClient';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Ekran otwierany z odnośnika w wiadomości e-mail — poza indeksem.
 *
 * Strona ma sens wyłącznie z ważnym tokenem w adresie; w wynikach wyszukiwania byłaby
 * komunikatem o nieprawidłowym odnośniku.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/verify-email', title: 'Potwierdzenie adresu e-mail', noindex: true });
}

export default function Page() {
	return <VerifyEmailClient />;
}
