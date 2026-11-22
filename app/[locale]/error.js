'use client';

import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';

/**
 * Ekran awarii strony.
 *
 * Do 22.11.2026 był tu angielski napis „Something went wrong!" bez stylów, także w wersji
 * polskiej. Teraz: jedno zdanie po ludzku i dwa wyjścia — ponów albo wróć na stronę główną.
 */
export default function Error({ reset }) {
	const t = useTranslations('ux_p5');

	return (
		<div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
			<h2 className="font-display text-xl font-bold text-text">{t('error_title')}</h2>
			<p className="mt-2 text-sm text-muted">{t('error_body')}</p>
			<div className="mt-6 flex flex-col gap-2 sm:flex-row">
				<Button variant="accent" onClick={() => reset()}>
					<RotateCcw size={16} aria-hidden="true" />
					{t('error_retry')}
				</Button>
				<Button asChild variant="outline">
					<Link href="/">{t('error_home')}</Link>
				</Button>
			</div>
		</div>
	);
}
