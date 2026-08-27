import { getTranslations } from 'next-intl/server';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import LegalDocument from '@/components/legal/LegalDocument';
import { REFUNDS, documentFor } from '@/lib/legal/documents';
import { UPDATED_AT } from '@/lib/legal/operator';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Zasady zwrotów jako osobna, indeksowana strona.
 *
 * Adres jest ten sam w obu językach (`/zwroty`), bo tłumaczenie ścieżek wymagałoby własnego
 * słownika tras w next-intl — a korzyść byłaby żadna: do dokumentu trafia się ze stopki i
 * z regulaminu, nie z wpisania adresu z pamięci.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;
	const doc = documentFor(REFUNDS, locale);

	return buildMetadata({
		locale,
		path: '/zwroty',
		title: doc.title,
		description:
			'Kiedy przysługuje zwrot pieniędzy, jak go zgłosić i w jakim terminie oddajemy środki. ' +
			'Osobno o prawie odstąpienia od umowy przy treściach cyfrowych.',
	});
}

export default async function Page({ params }) {
	const { locale } = await params;
	const t = await getTranslations('common');

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<BackLink label={t('back_home')} />
			<LegalDocument document={documentFor(REFUNDS, locale)} updatedAt={UPDATED_AT} />
		</AppShell>
	);
}
