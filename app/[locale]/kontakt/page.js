import { getTranslations } from 'next-intl/server';
import { AtSign, Building2, FileText, ShieldCheck } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { OPERATOR } from '@/lib/legal/operator';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Dane usługodawcy i punkt kontaktu.
 *
 * Osobna strona, a nie akapit w regulaminie: adres do reklamacji, do zgłoszeń treści
 * i do żądań z RODO ma być do znalezienia bez czytania kilkunastu paragrafów.
 */
function DataRow({ icon: Icon, label, value }) {
	if (!value) return null;
	return (
		<div className="flex items-start gap-3 py-2">
			<Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
			<div className="min-w-0">
				<p className="text-xs uppercase tracking-wide text-muted">{label}</p>
				<p className="text-sm text-text">{value}</p>
			</div>
		</div>
	);
}

export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/kontakt',
		title: locale === 'en' ? 'Contact and company details' : 'Kontakt i dane firmy',
		description:
			locale === 'en'
				? 'Operator details, VAT ID and the address for complaints, personal data requests and reports of illegal content.'
				: 'Dane usługodawcy, NIP oraz adres do reklamacji, żądań dotyczących danych osobowych i zgłoszeń treści bezprawnych.',
	});
}

export default async function ContactPage() {
	const t = await getTranslations('common');

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<BackLink label={t('back_home')} />

			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text sm:text-3xl">
				{t('contact_title')}
			</h1>
			<p className="mt-3 text-sm leading-relaxed text-muted">{t('contact_intro')}</p>

			<Card className="mt-6">
				<CardContent className="px-5 py-4">
					<DataRow icon={Building2} label={t('contact_operator')} value={OPERATOR.name} />
					<DataRow icon={Building2} label={t('contact_address')} value={OPERATOR.address} />
					<DataRow icon={FileText} label="NIP" value={OPERATOR.nip} />
					<DataRow icon={FileText} label="REGON" value={OPERATOR.regon} />
					<DataRow icon={AtSign} label={t('contact_email')} value={OPERATOR.email} />
				</CardContent>
			</Card>

			<div className="mt-6 flex flex-wrap gap-3">
				<Link href="/regulamin" className="footer-link inline-flex items-center gap-2">
					<FileText size={15} aria-hidden="true" />
					{t('terms_title')}
				</Link>
				<Link href="/polityka-prywatnosci" className="footer-link inline-flex items-center gap-2">
					<ShieldCheck size={15} aria-hidden="true" />
					{t('privacy_title')}
				</Link>
			</div>

			<p className="mt-8 text-xs leading-relaxed text-muted">{t('contact_responsible')}</p>
		</AppShell>
	);
}
