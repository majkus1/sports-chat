import ReportDetailClient from '@/components/reports/ReportDetailClient';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Trasa poza indeksem.
 *
 * Raport należy do konta, które go wygenerowało, i API nie odda go nikomu innemu.
 * Adres w wynikach wyszukiwania prowadziłby wyłącznie do komunikatu o braku dostępu.
 *
 * `noindex` w metadanych działa niezależnie od `robots.txt`: plik prosi, żeby nie wchodzić,
 * ale nie usuwa z wyników adresu, który już się tam znalazł — a wejście z odnośnika
 * z zewnątrz nie podlega temu plikowi w ogóle.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/pilka-nozna/raport', title: 'Raport AI', noindex: true });
}

export default function Page({ params }) {
	// Obietnicę przekazujemy dalej bez rozpakowywania — klient robi to przez `use()`.
	return <ReportDetailClient params={params} />;
}
