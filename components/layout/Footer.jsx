'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Logo from '@/components/Logo';
import { LEGAL_LINKS, SITE_LINKS, SPORT_CATEGORIES } from '@/lib/navigation';
import { clearConsent } from '@/lib/consent';
import { cn } from '@/lib/utils';
import { SOCIAL } from '@/lib/seo/config';

/**
 * Aplikacja nie miała stopki w ogóle — brakowało miejsca na informację o odpowiedzialnej grze,
 * które przy treściach analitycznych o meczach powinno być stale widoczne.
 */
export default function Footer({ className }) {
	const t = useTranslations('common');
	const locale = useLocale();
	const year = new Date().getFullYear();

	return (
		/* Duży odstęp nad kreską: stopka ma być wyraźnie oddzielona od treści, a nie
		   sprawiać wrażenia kolejnej sekcji strony. */
		<footer
			className={cn(
				'mt-20 border-t border-border px-5 py-10 text-sm sm:mt-24 sm:py-12',
				className
			)}
		>
			<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-sm">
					{/* Ten sam znak co w nagłówku — stopka domyka stronę marką, nie samym tekstem. */}
					<Link href="/" aria-label={t('mainpage')} className="inline-flex">
						<Logo locale={locale} />
					</Link>
					<p className="mt-3 leading-relaxed text-muted">{t('footer_tagline')}</p>
					{/* Typ dnia codziennie rano także na X — link zewnętrzny, w nowej karcie. */}
					<a
						href={SOCIAL.x.url}
						target="_blank"
						rel="noopener noreferrer me"
						className="footer-link mt-3 inline-flex items-center gap-2"
					>
						<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
							<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
						</svg>
						{t('footer_follow_x')} {SOCIAL.x.handle}
					</a>
				</div>

				{/*
				 * Kolumna na dyscyplinę, a nie płaska lista: „przedmeczowe" czy „na żywo"
				 * to działy piłki nożnej, nie sekcje serwisu. Kolejny sport doda się sam
				 * z lib/navigation.js.
				 */}
				<nav
					aria-label={t('footer_nav_label')}
					className="flex flex-wrap gap-x-12 gap-y-6 sm:justify-end"
				>
					{SPORT_CATEGORIES.map((sport) => (
						<div key={sport.key} className="flex flex-col gap-2">
							<p className="text-xs font-bold uppercase tracking-wide text-text">
								{t(sport.labelKey)}
							</p>
							{sport.sections.map((section) => (
								<Link key={section.href} href={section.href} className="footer-link">
									{t(section.labelKey)}
								</Link>
							))}
						</div>
					))}

					<div className="flex flex-col gap-2">
						<p className="text-xs font-bold uppercase tracking-wide text-text">
							{t('footer_service')}
						</p>
						{SITE_LINKS.map((link) => (
							<Link key={link.href} href={link.href} className="footer-link">
								{t(link.labelKey)}
							</Link>
						))}
					</div>

					<div className="flex flex-col gap-2">
						<p className="text-xs font-bold uppercase tracking-wide text-text">
							{t('footer_legal')}
						</p>
						{LEGAL_LINKS.map((link) => (
							<Link key={link.href} href={link.href} className="footer-link">
								{t(link.labelKey)}
							</Link>
						))}
						{/*
						 * Powrót do wyboru zgód. Zgoda, której nie da się wycofać równie łatwo,
						 * jak jej udzielono, nie jest zgodą — wyczyszczenie decyzji przywraca baner.
						 */}
						<button
							type="button"
							onClick={clearConsent}
							className="footer-link bg-transparent p-0 text-left"
						>
							{t('cookies_settings')}
						</button>
					</div>
				</nav>
			</div>

			<p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted">
				{t('footer_responsible_gaming')}
			</p>
			<p className="mt-2 text-xs text-muted">© {year} Czat Sportowy</p>
		</footer>
	);
}
