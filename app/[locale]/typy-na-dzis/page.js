import { ArrowRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import DailyPickCard from '@/components/today/DailyPickCard';
import TodayPicksList from '@/components/today/TodayPicksList';
import CouponCard from '@/components/coupons/CouponCard';
import CouponsLive from '@/components/coupons/CouponsLive';
import { Link } from '@/i18n/routing';
import connectToDb from '@/lib/db';
import { dailyOverview, dailyOverviewCached, withTimeout } from '@/lib/daily/service';
import { hintsForDate } from '@/lib/model/hints';
import { todayPicksContent } from '@/lib/landing/todayPicks';
import { couponsOverview } from '@/lib/coupons/service';
import { couponContent } from '@/lib/coupons/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbLd } from '@/lib/seo/jsonLd';
import { localDate } from '@/lib/time';

/**
 * „Typy na dziś" — publiczna strona pod frazę, którą ludzie wpisują codziennie.
 *
 * Renderowana na serwerze przy każdym żądaniu (dane zmieniają się w ciągu dnia), więc robot
 * dostaje gotowy HTML: typ dnia z liczbami i powodami, listę dzisiejszych typów modelu
 * (za kłódką poza typem dnia — tak widzi je robot i gość), kupon dnia i weekendowy (za darmo,
 * z kursami — `lib/coupons`), wczorajszy wynik i dorobek.
 * Liczenie jest tanie: model i plakietki siedzą w pamięci procesu, typ dnia w bazie.
 *
 * Adres bez segmentu dyscypliny i po polsku — krótki i dokładnie taki, jak fraza.
 */

export const dynamic = 'force-dynamic';

function ladnaData(locale, date = new Date()) {
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	}).format(date);
}

export async function generateMetadata({ params }) {
	const { locale } = await params;
	const c = todayPicksContent(locale);
	const krotka = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		day: '2-digit',
		month: '2-digit',
	}).format(new Date());
	return buildMetadata({ locale, path: '/typy-na-dzis', title: c.metaTitle(krotka), description: c.metaDescription });
}

export default async function Page({ params }) {
	const { locale } = await params;
	const c = todayPicksContent(locale);
	const k = couponContent(locale);
	const dzis = localDate();
	let kupony = null;

	let overview = { today: null, tomorrow: null, yesterday: null, record: { won: 0, total: 0 } };
	let lista = [];
	let listaJutro = [];
	const jutro = localDate(new Date(), 1);
	/** Lista dnia dla strony: typ dnia odkryty, reszta za kłódką (plan odkrywa ją u klienta). */
	const doListy = (list, dziennyId) =>
		list.slice(0, 12).map((w) => ({
			fixtureId: w.fixtureId,
			home: w.home,
			away: w.away,
			league: w.league,
			kickoff: w.kickoff,
			// Gość i robot widzą typ tylko przy typie dnia — reszta za kłódką, jak na liście meczów.
			hint: w.fixtureId === dziennyId ? { ...w.hint, daily: true } : { locked: true },
		}));
	try {
		await connectToDb();
		/*
		 * Limity czasu: robot wyszukiwarki nie czeka minut. Gdy wybór typu dnia albo plakietki
		 * nie zdążą (zimny start, wolny dostawca), strona pokazuje to, co już zapisane, a liczenie
		 * kończy się w tle i zasila pamięć podręczną na kolejne żądanie.
		 */
		// Oba liczenia równolegle — najgorszy przypadek to jeden limit, nie suma.
		const [ov, hinty, kup] = await Promise.all([
			withTimeout(dailyOverview(), 8000, null),
			withTimeout(hintsForDate(dzis), 8000, { list: [] }),
			// Kupony to sam odczyt z bazy — powstają w przebiegu co 20 minut, nie tutaj.
			couponsOverview().catch(() => null),
		]);
		kupony = kup;
		overview = ov || (await dailyOverviewCached());
		lista = doListy(hinty.list, overview.today?.fixtureId);
		/*
		 * Wieczorem (dzisiejszy typ dnia już trwa) strona pokazuje typ dnia na jutro — wtedy także
		 * jutrzejszą listę. Bez niej najmocniejszy jutrzejszy typ ze strony głównej nie miał tu
		 * odpowiednika, a robot nie dostawał linków do jutrzejszych stron meczów.
		 */
		if (overview.tomorrow) {
			const jutroHinty = await withTimeout(hintsForDate(jutro), 8000, { list: [] });
			listaJutro = doListy(jutroHinty.list, overview.tomorrow.fixtureId);
		}
	} catch (error) {
		console.warn('[typy-na-dzis] dane niedostępne:', error.message);
	}

	const { today, tomorrow, yesterday, record } = overview;
	const labels = { usually: c.usually, listEmpty: c.listEmpty, listLocked: c.listLocked };

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: locale === 'en' ? 'Home' : 'Strona główna', path: '/' },
					{ name: c.breadcrumb, path: '/typy-na-dzis' },
				])}
			/>

			<h1 className="font-display text-3xl font-bold leading-tight text-text sm:text-4xl">{c.title(ladnaData(locale))}</h1>
			<p className="mt-3 text-base leading-relaxed text-muted">{c.lead}</p>

			<div className="mt-6 flex flex-col gap-4">
				{today ? (
					<DailyPickCard pick={today} c={c} label={c.dailyLabel} locale={locale} />
				) : (
					!tomorrow && <p className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">{c.noPick}</p>
				)}
				{tomorrow && <DailyPickCard pick={tomorrow} c={c} label={c.tomorrowLabel} locale={locale} />}
			</div>

			{kupony && (kupony.today || kupony.days3 || kupony.days5 || kupony.todayLater || kupony.paidLater) && (
				<section className="mt-8" aria-labelledby="kupony">
					<h2 id="kupony" className="font-display text-xl font-bold uppercase tracking-wide text-text">
						{k.sectionTitle}
					</h2>
					<p className="mt-1.5 text-sm leading-relaxed text-muted">{k.sectionLead}</p>
					<CouponsLive initial={kupony} locale={locale} className="mt-4" />
					<p className="mt-3 text-xs leading-relaxed text-muted">{k.how}</p>
				</section>
			)}

			{/* Pusta lista (brak typów albo dane nie zdążyły) — bez nagłówka „0 typów". */}
			{lista.length > 0 && (
				<section className="mt-8" aria-labelledby="lista-typow">
					<h2 id="lista-typow" className="font-display text-xl font-bold uppercase tracking-wide text-text">
						{c.listTitle(lista.length)}
					</h2>
					<TodayPicksList items={lista} date={dzis} locale={locale} labels={labels} />
				</section>
			)}

			{listaJutro.length > 0 && (
				<section className="mt-8" aria-labelledby="lista-jutro">
					<h2 id="lista-jutro" className="font-display text-xl font-bold uppercase tracking-wide text-text">
						{c.listTitleTomorrow(listaJutro.length)}
					</h2>
					<TodayPicksList items={listaJutro} date={jutro} locale={locale} labels={labels} />
				</section>
			)}

			{(yesterday || record.total > 0 || kupony?.yesterday?.legs?.length > 0) && (
				<section className="mt-8" aria-labelledby="wczoraj">
					<h2 id="wczoraj" className="font-display text-xl font-bold uppercase tracking-wide text-text">
						{kupony?.yesterday?.legs?.length > 0 ? k.yesterdaySection : c.yesterday}
					</h2>
					<div className="mt-3 flex flex-col gap-3">
						{yesterday && <DailyPickCard pick={yesterday} c={c} label={c.yesterday} locale={locale} compact />}
						{record.total > 0 && <p className="text-sm font-semibold text-text">{c.record(record.won, record.total)}</p>}
						{kupony?.yesterday?.legs?.length > 0 && (
							<CouponCard coupon={kupony.yesterday} c={k} label={k.yesterday} locale={locale} compact />
						)}
						{['daily', 'days3', 'days5'].map(
							(typ) =>
								kupony?.record?.[typ]?.total > 0 && (
									<p key={typ} className="text-sm font-semibold text-text">
										{k.record(typ, kupony.record[typ].won, kupony.record[typ].total)}
									</p>
								)
						)}
					</div>
				</section>
			)}

			<section className="mt-8 rounded-[var(--radius-ui)] border border-border bg-surface px-5 py-4" aria-labelledby="jak-czytac">
				<h2 id="jak-czytac" className="text-sm font-bold text-text">
					{c.howTitle}
				</h2>
				<p className="mt-1.5 text-sm leading-relaxed text-muted">{c.how}</p>
				<Link href="/jak-to-dziala" className="mt-2 inline-flex text-sm font-semibold text-accent no-underline hover:underline">
					{c.howLink}
				</Link>
			</section>

			<div className="mt-8 flex flex-col gap-3">
				<Link
					href="/pilka-nozna/przedmeczowe"
					className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] bg-accent px-5 py-3 text-base font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
				>
					{c.ctaMatches}
					<ArrowRight size={18} aria-hidden="true" />
				</Link>
				<p className="text-center text-sm text-muted">{c.ctaTrial}</p>
			</div>

			<p className="mt-8 text-xs leading-relaxed text-muted">{c.disclaimer}</p>
		</AppShell>
	);
}
