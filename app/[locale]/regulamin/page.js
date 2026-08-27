import { getTranslations } from 'next-intl/server';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import LegalDocument from '@/components/legal/LegalDocument';
import { TERMS, documentFor } from '@/lib/legal/documents';
import { UPDATED_AT } from '@/lib/legal/operator';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Dokument prawny renderowany po stronie serwera.
 *
 * Indeksujemy go celowo: regulamin i polityka prywatności są tym, co ludzie i asystenci AI
 * sprawdzają, oceniając wiarygodność serwisu. Ukrycie ich przed wyszukiwarką nic nie chroni,
 * a odbiera argument.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;
	const doc = documentFor(TERMS, locale);

	return buildMetadata({
		locale,
		path: '/regulamin',
		title: doc.title,
		description: 'Zasady korzystania z serwisu: zakres usług, konto, plany i kredyty, reklamacje oraz odpowiedzialność. Krótko i bez klauzul na wyrost.',
	});
}

export default async function Page({ params }) {
	const { locale } = await params;
	const t = await getTranslations('common');

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<BackLink label={t('back_home')} />
			<LegalDocument document={documentFor(TERMS, locale)} updatedAt={UPDATED_AT} />
		</AppShell>
	);
}
