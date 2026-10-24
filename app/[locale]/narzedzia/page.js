import AppShell from '@/components/layout/AppShell';
import { FeaturedTools, ToolGroup, ToolsDisclaimer, ToolsHero } from '@/components/tools/ToolsSections';
import ToolsCta from '@/components/tools/ToolsCta';
import { toolsContent } from '@/lib/tools/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbLd } from '@/lib/seo/jsonLd';

/**
 * „Narzędzia" — wszystkie funkcje serwisu na jednej stronie, w kafelkach.
 *
 * Powstała, bo funkcji przybyło szybciej, niż nawigacja umiała je pokazać: kupon live siedzi
 * na liście meczów na żywo, raport „Wyższe kursy" w przełączniku raportu, poranny mail
 * w panelu konta. Gość nie wiedział, co tu w ogóle jest, a płacący — gdzie to znaleźć.
 *
 * Strona w całości serwerowa (treść w HTML-u od pierwszego bajtu), treść i dane kafelków
 * w `lib/tools/content.js`. Adres po polsku i bez segmentu dyscypliny — jak „Jak to działa".
 */

export async function generateMetadata({ params }) {
	const { locale } = await params;
	const c = toolsContent(locale);

	return buildMetadata({ locale, path: '/narzedzia', title: c.metaTitle, description: c.metaDescription });
}

export default async function Page({ params }) {
	const { locale } = await params;
	const c = toolsContent(locale);

	return (
		// 16 px po bokach na telefonie (reszta serwisu ma 20) — przy kafelkach liczy się każdy piksel szerokości.
		<AppShell contentClassName="mx-auto w-full max-w-5xl px-4 sm:px-5">
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: c.breadcrumbHome, path: '/' },
					{ name: c.breadcrumb, path: '/narzedzia' },
				])}
			/>

			<ToolsHero content={c} />
			<FeaturedTools content={c} />
			{c.groups.map((group) => (
				<ToolGroup key={group.id} group={group} access={c.access} accessPrefix={c.accessPrefix} />
			))}
			<ToolsCta content={c.cta} />
			<ToolsDisclaimer text={c.disclaimer} />
		</AppShell>
	);
}
