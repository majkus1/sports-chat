'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';

/**
 * „Nie ma takiej strony" w układzie serwisu.
 *
 * Bez tego pliku `notFound()` z podstron (np. nieznany typ albo liga) kończył na gołym
 * „404 - Page Not Found" z `app/not-found.js`, po angielsku i bez menu. Tu stoi nagłówek
 * i stopka, a przycisk prowadzi tam, po co gracz przyszedł: do typów na dziś.
 */
export default function NotFound() {
	const t = useTranslations('ux_p5');

	return (
		<div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
			<h1 className="font-display text-xl font-bold text-text">{t('not_found_title')}</h1>
			<p className="mt-2 text-sm text-muted">{t('not_found_body')}</p>
			<div className="mt-6 flex flex-col gap-2 sm:flex-row">
				<Button asChild variant="accent">
					<Link href="/typy-na-dzis">{t('not_found_cta')}</Link>
				</Button>
				<Button asChild variant="outline">
					<Link href="/">{t('error_home')}</Link>
				</Button>
			</div>
		</div>
	);
}
