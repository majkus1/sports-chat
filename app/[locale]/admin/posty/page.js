import { notFound } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import PostActions from '@/components/admin/PostActions';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { dailyOverview, dailyOverviewCached, withTimeout } from '@/lib/daily/service';
import { couponsOverview } from '@/lib/coupons/service';
import { buildCouponPost, buildDailyPost, xIntentUrl, X_LIMIT } from '@/lib/social/posts';
import { buildMetadata } from '@/lib/seo/metadata';
import { SITE_URL } from '@/lib/seo/config';

/**
 * Gotowy post z typem dnia — strona tylko dla administratora.
 *
 * To samo, co ramka w porannym mailu, dostępne o dowolnej porze: rano typ na dziś, a gdy
 * dzisiejszy mecz już się zaczął — typ na jutro. Pod nim posty z kuponem dnia i weekendowym
 * (od 9:30, dopóki pierwszy mecz kuponu się nie zaczął). Dla każdego innego konta (i gościa)
 * strona nie istnieje (404), a wyszukiwarka jej nie indeksuje.
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

export default async function Page() {
	const session = await getAuthenticatedUser();
	if (!session) notFound();
	await connectToDb();
	const user = await User.findById(session.userId).select('role').lean();
	if (user?.role !== 'admin') notFound();

	const ov = (await withTimeout(dailyOverview(), 8000, null)) || (await dailyOverviewCached());
	const dzisAktualny = ov.today && ov.today.status === 'pending' && Date.parse(ov.today.kickoff) > Date.now();
	const typ = dzisAktualny ? ov.today : ov.tomorrow;
	// Dla posta na jutro „wczoraj" to dzisiejszy typ — o ile już rozliczony (rozliczenie jest nocą).
	const poprzedni = dzisAktualny ? ov.yesterday : ov.today;
	const post = buildDailyPost({ daily: typ, yesterday: poprzedni, record: ov.record, siteUrl: SITE_URL });
	const kupony = await couponsOverview().catch(() => null);
	const postyKuponow = [
		{ tytul: 'Kupon dnia', post: buildCouponPost({ coupon: kupony?.today, previous: kupony?.yesterday, siteUrl: SITE_URL }) },
		{ tytul: 'Kupon weekendowy', post: buildCouponPost({ coupon: kupony?.weekend, siteUrl: SITE_URL }) },
	].filter((k) => k.post);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-2xl">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">Post na X</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				{dzisAktualny ? 'Typ dnia na dziś.' : 'Dzisiejszy typ dnia już się zaczął albo go nie ma — post z typem na jutro.'} Ten sam
				tekst przychodzi rano w Twoim porannym mailu.
			</p>

			{post ? (
				<PostBox post={post} />
			) : (
				<p className="mt-6 rounded-[var(--radius-ui)] border border-border bg-surface p-5 text-sm text-muted">
					Ani dziś, ani jutro nie ma jeszcze typu dnia — nie ma czego publikować. Typ na jutro wybiera się,
					gdy dzisiejszy mecz już trwa; zajrzyj później.
				</p>
			)}

			{postyKuponow.map((k) => (
				<section key={k.tytul} className="mt-10">
					<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">{k.tytul}</h2>
					<PostBox post={k.post} />
				</section>
			))}
			{!postyKuponow.length && (
				<p className="mt-10 text-sm text-muted">
					Kuponu do publikacji teraz nie ma — kupon dnia powstaje o 9:30, weekendowy w piątek o 9:30. Post znika, gdy
					zacznie się pierwszy mecz kuponu.
				</p>
			)}
		</AppShell>
	);
}
