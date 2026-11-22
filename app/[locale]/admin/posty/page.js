import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import AppShell from '@/components/layout/AppShell';
import PostActions from '@/components/admin/PostActions';
import AdminNav from '@/components/growth/AdminNav';
import PostVariants from '@/components/growth/PostVariants';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { dailyOverview, dailyOverviewCached, withTimeout } from '@/lib/daily/service';
import { couponsOverview } from '@/lib/coupons/service';
import { buildDailyPost, xIntentUrl, X_LIMIT } from '@/lib/social/posts';
import { buildCouponVariants, buildRecapVariants, buildWeekVariants } from '@/lib/growth/posts';
import { weekNumbers, yesterdayPicks } from '@/lib/growth/recap';
import { buildMetadata } from '@/lib/seo/metadata';
import { SITE_URL } from '@/lib/seo/config';
import { Link } from '@/i18n/routing';

/**
 * Gotowe posty — strona tylko dla administratora.
 *
 * Na górze typ dnia na X — to samo, co ramka w porannym mailu, dostępne o dowolnej porze: rano typ
 * na dziś, a gdy dzisiejszy mecz już się zaczął — typ na jutro. Niżej trzy posty w czterech formatach
 * (X, grupa na Facebooku, TikTok, Instagram), każdy z linkiem z utm (`lib/growth/posts.js`):
 * kupon dnia (darmowy; płatnych nie publikujemy — od 9:30, dopóki pierwszy mecz się nie zaczął),
 * rozliczenie wczoraj z pudłami i tydzień w liczbach. Nic nie publikuje się samo.
 *
 * Dla każdego innego konta (i gościa) strona nie istnieje (404), a wyszukiwarka jej nie indeksuje.
 */

/** Ramka z gotowym postem: tekst, licznik znaków i przyciski. */
function PostBox({ post }) {
	return (
		<div className="mt-4 rounded-[var(--radius-ui)] border border-border bg-surface p-5">
			<pre className="whitespace-pre-wrap font-[inherit] text-[15px] leading-relaxed text-text">{post.text}</pre>
			<p className={`mt-3 text-xs ${post.length > X_LIMIT ? 'text-loss' : 'text-muted'}`}>
				{post.length}/{X_LIMIT} znaków (tak liczy X: link to 23, emoji po 2)
			</p>
			<div className="mt-4">
				<PostActions text={post.text} intentUrl={xIntentUrl(post.text)} />
			</div>
		</div>
	);
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/admin/posty', title: 'Posty', noindex: true });
}

export default async function Page({ params }) {
	const { locale } = await params;
	const session = await getAuthenticatedUser();
	if (!session) notFound();
	await connectToDb();
	const user = await User.findById(session.userId).select('role').lean();
	if (user?.role !== 'admin') notFound();
	const t = await getTranslations({ locale, namespace: 'growth' });

	const ov = (await withTimeout(dailyOverview(), 8000, null)) || (await dailyOverviewCached());
	const dzisAktualny = ov.today && ov.today.status === 'pending' && Date.parse(ov.today.kickoff) > Date.now();
	const typ = dzisAktualny ? ov.today : ov.tomorrow;
	// Dla posta na jutro „wczoraj" to dzisiejszy typ — o ile już rozliczony (rozliczenie jest nocą).
	const poprzedni = dzisAktualny ? ov.yesterday : ov.today;
	const post = buildDailyPost({ daily: typ, yesterday: poprzedni, record: ov.record, siteUrl: SITE_URL });

	// Sam odczyt z bazy; awaria jednego źródła nie zabiera pozostałych postów.
	const [kupony, wczoraj, tydzien] = await Promise.all([
		couponsOverview().catch(() => null),
		yesterdayPicks().catch(() => null),
		weekNumbers().catch(() => null),
	]);
	const kupon = buildCouponVariants({ coupon: kupony?.today, previous: kupony?.yesterday, siteUrl: SITE_URL });
	const rozliczenie = wczoraj
		? buildRecapVariants({ ...wczoraj, daily: ov.yesterday, coupon: kupony?.yesterday, siteUrl: SITE_URL })
		: null;
	const tydzienPosty = tydzien ? buildWeekVariants({ ...tydzien, siteUrl: SITE_URL }) : null;

	return (
		<AppShell contentClassName="mx-auto w-full max-w-2xl">
			<AdminNav active="posts" labels={{ posts: t('admin_nav_posts'), sources: t('admin_nav_sources'), aria: t('admin_nav_aria') }} />
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">Post na X</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				{dzisAktualny ? 'Typ dnia na dziś.' : 'Dzisiejszy typ dnia już się zaczął albo go nie ma — post z typem na jutro.'} Ten sam
				tekst przychodzi rano w Twoim porannym mailu.
			</p>
			<p className="mt-1 text-sm text-muted">
				Raporty modelu i korekta szansy: <Link href="/admin/model">/admin/model</Link>.
			</p>

			{post ? (
				<PostBox post={post} />
			) : (
				<p className="mt-6 rounded-[var(--radius-ui)] border border-border bg-surface p-5 text-sm text-muted">
					Ani dziś, ani jutro nie ma jeszcze typu dnia — nie ma czego publikować. Typ na jutro wybiera się,
					gdy dzisiejszy mecz już trwa; zajrzyj później.
				</p>
			)}

			<div className="mt-10 rounded-[var(--radius-ui)] border border-border bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
				{t('posts_rules')}
			</div>

			{kupon ? (
				<PostVariants title={t('posts_coupon_title')} lead={t('posts_coupon_lead')} variants={kupon} />
			) : (
				<section className="mt-10">
					<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">{t('posts_coupon_title')}</h2>
					<p className="mt-2 text-sm text-muted">{t('posts_coupon_none')}</p>
				</section>
			)}

			{rozliczenie ? (
				<PostVariants title={t('posts_recap_title')} lead={t('posts_recap_lead')} variants={rozliczenie} />
			) : (
				<section className="mt-10">
					<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">{t('posts_recap_title')}</h2>
					<p className="mt-2 text-sm text-muted">{t('posts_recap_none')}</p>
				</section>
			)}

			{tydzienPosty ? (
				<PostVariants title={t('posts_week_title')} lead={t('posts_week_lead')} variants={tydzienPosty} />
			) : (
				<section className="mt-10">
					<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">{t('posts_week_title')}</h2>
					<p className="mt-2 text-sm text-muted">{t('posts_week_none')}</p>
				</section>
			)}
		</AppShell>
	);
}
