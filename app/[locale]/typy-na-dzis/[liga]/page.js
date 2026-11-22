import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Lock, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import LeagueLinks from '@/components/seo/LeagueLinks';
import PaidPickReveal from '@/components/seo/PaidPickReveal';
import { Link } from '@/i18n/routing';
import DailyPick from '@/models/DailyPick';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbLd } from '@/lib/seo/jsonLd';
import { SITE_URL } from '@/lib/seo/config';
import { leagueName, leaguePageBySlug, leaguePath } from '@/lib/seo/leagues';
import { activeLeaguePages, leaguePageData } from '@/lib/seo/seoData';
import { leaguePageContent, leaguePageModel } from '@/lib/seo/leaguePage';
import { ldScript, sportsEventData } from '@/lib/seo/matchPreview';
import { accuracyHref } from '@/lib/urlState';
import { cn } from '@/lib/utils';
import { localDate } from '@/lib/time';

/**
 * „Typy na dziś [liga]" — indeksowana strona ligi z dziennika prognoz. Opis w `lib/seo/leaguePage.js`.
 *
 * Dziesięć minut w pamięci podręcznej (jak strona meczu): prognoza w dzienniku się nie zmienia
 * (pierwsza zostaje), a robot może chodzić po dziewiętnastu ligach bez kosztu — trzy małe
 * zapytania do bazy na stronę, zero do dostawcy danych.
 */
export const revalidate = 600;

const wczytaj = cache(async (slug) => {
	const league = leaguePageBySlug(slug);
	if (!league) return null;
	const now = new Date();
	const { matches, settled } = await leaguePageData(league, now);
	const ids = matches.map((m) => String(m.fixtureId));
	const dzienne = ids.length
		? await DailyPick.find({ fixtureId: { $in: ids } })
				.select('fixtureId')
				.lean()
				.catch(() => [])
		: [];
	return { league, now, matches, settled, dailyIds: new Set(dzienne.map((d) => String(d.fixtureId))) };
});

function krotkaData(locale, d = new Date()) {
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' }).format(d);
}

function godzina(locale, iso) {
	return new Date(iso).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
}

export async function generateMetadata({ params }) {
	const { locale, liga } = await params;
	const d = await wczytaj(liga);
	if (!d) return buildMetadata({ locale, path: `/typy-na-dzis/${liga}`, title: locale === 'en' ? 'Competition' : 'Rozgrywki', noindex: true });
	const c = leaguePageContent(locale);
	const model = leaguePageModel({ ...d, locale });
	const n = model.today.length + model.tomorrow.length;
	return buildMetadata({
		locale,
		path: leaguePath(d.league),
		title: c.metaTitle(d.league, krotkaData(locale, d.now)),
		description: model.indexable ? c.metaDescription(d.league, n, model.record) : c.metaEmpty(d.league),
		// Bez meczów z liczbami — poza indeksem, ale linki (mecze, inne ligi) robot ma przejść.
		noindex: !model.indexable,
		follow: true,
	});
}

/** Trzy szanse w jednym pasku — najwyższa w kolorze akcentu. */
function Szanse({ n, home, away, draw }) {
	const szanse = [
		{ k: 'home', label: home, v: n.home },
		{ k: 'draw', label: draw, v: n.draw },
		{ k: 'away', label: away, v: n.away },
	];
	const maks = Math.max(n.home, n.draw, n.away);
	return (
		<div>
			<div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
				{szanse.map((s) => (
					<span key={s.k} className={cn('h-full', s.v === maks ? 'bg-accent' : 'bg-border-strong', s.k === 'draw' && s.v !== maks && 'opacity-60')} style={{ width: `${s.v}%` }} />
				))}
			</div>
			<p className="mt-1.5 flex justify-between gap-2 text-xs tabular-nums text-muted">
				{szanse.map((s) => (
					<span key={s.k} className={cn('truncate', s.v === maks && 'font-bold text-text')}>
						{s.label} {s.v}%
					</span>
				))}
			</p>
		</div>
	);
}

function Typ({ pick, c, fixtureId, kickoff }) {
	if (pick.state === 'none') return <span className="text-xs text-muted">{c.pickNone}</span>;
	if (pick.state === 'locked')
		return (
			// Kłódka z serwera dla wszystkich; zalogowany z planem dostaje typ w przeglądarce (`PaidPickReveal`).
			<PaidPickReveal fixtureId={fixtureId} date={localDate(new Date(kickoff))} usually={c.usually}>
				<span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
					<Lock size={12} aria-hidden="true" />
					{c.pickLocked}
				</span>
			</PaidPickReveal>
		);
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
			<span className="rounded-md bg-accent px-2 py-0.5 font-bold text-accent-fg">{pick.selection}</span>
			<span className="font-bold tabular-nums text-text">{pick.probability}%</span>
			<span className="text-muted">
				({c.usually} {pick.base}%)
			</span>
			{pick.outcome && (
				<span className={cn('inline-flex items-center gap-0.5 font-bold', pick.outcome === 'won' ? 'text-accent' : 'text-loss')}>
					{pick.outcome === 'won' ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
					{pick.outcome === 'won' ? c.won : c.lost}
				</span>
			)}
		</span>
	);
}

function Dzien({ title, items, c, locale }) {
	if (!items.length) return null;
	return (
		<section className="mt-6">
			<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h2>
			<ul className="mt-3 flex flex-col gap-3">
				{items.map((m) => (
					<li key={m.fixtureId}>
						<Link
							href={m.href}
							className="group block rounded-[var(--radius-ui)] border border-border bg-surface p-4 no-underline shadow-[var(--shadow-soft)] transition-colors hover:border-accent"
						>
							<div className="flex items-start justify-between gap-3">
								<span className="min-w-0">
									<span className="block text-[11px] font-bold uppercase tracking-wide text-muted tabular-nums">{godzina(locale, m.kickoff)}</span>
									<span className="mt-0.5 block font-display text-lg font-bold leading-tight text-text">
										{m.home} – {m.away}
									</span>
								</span>
								{m.score && (
									<span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-sm font-bold tabular-nums text-text">
										{c.result} {m.score}
									</span>
								)}
							</div>
							<div className="mt-3">
								<Szanse n={m.numbers} home={m.home} away={m.away} draw={c.draw} />
							</div>
							<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
								<Typ pick={m.pick} c={c} fixtureId={m.fixtureId} kickoff={m.kickoff} />
								<span className="text-xs text-muted tabular-nums">
									{c.goals}: {m.numbers.lambdaHome} – {m.numbers.lambdaAway}
								</span>
							</div>
							<span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent group-hover:underline">
								{c.open}
								<ArrowRight size={14} aria-hidden="true" />
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

export default async function Page({ params }) {
	const { locale, liga } = await params;
	const d = await wczytaj(liga);
	if (!d) notFound();
	const c = leaguePageContent(locale);
	const model = leaguePageModel({ ...d, locale });
	const aktywne = await activeLeaguePages(d.now);
	const nazwa = leagueName(d.league, locale);
	const path = leaguePath(d.league);
	const wszystkie = [...model.today, ...model.tomorrow];

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: c.home, path: '/' },
					{ name: c.todayPicks, path: '/typy-na-dzis' },
					{ name: nazwa, path },
				])}
			/>
			{wszystkie.length > 0 && (
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={ldScript({
						'@graph': wszystkie.map((m) =>
							sportsEventData({
								forecast: d.matches.find((f) => String(f.fixtureId) === m.fixtureId),
								url: `${SITE_URL}/${locale}${m.href}`,
								name: `${m.home} – ${m.away}`,
							})
						),
					})}
				/>
			)}

			<nav aria-label="breadcrumb" className="text-xs text-muted">
				<Link href="/typy-na-dzis" className="font-semibold text-muted no-underline hover:text-text hover:underline">
					{c.todayPicks}
				</Link>
				<span aria-hidden="true"> / </span>
				<span>{nazwa}</span>
			</nav>
			<h1 className="mt-2 font-display text-3xl font-bold leading-tight text-text sm:text-4xl">{c.h1(d.league)}</h1>
			<p className="mt-3 text-base leading-relaxed text-muted">{c.lead}</p>

			{wszystkie.length === 0 ? (
				<p className="mt-6 rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">{c.empty}</p>
			) : (
				<>
					<Dzien title={c.today} items={model.today} c={c} locale={locale} />
					<Dzien title={c.tomorrow} items={model.tomorrow} c={c} locale={locale} />
					{model.withPick > 0 && <p className="mt-3 text-xs leading-relaxed text-muted">{c.lockedNote}</p>}
				</>
			)}

			<section className="mt-10" aria-labelledby="rozliczenie-ligi">
				<h2 id="rozliczenie-ligi" className="font-display text-xl font-bold uppercase tracking-wide text-text">
					{c.recordTitle}
				</h2>
				{model.record.total > 0 ? (
					<>
						<p className="mt-2 text-sm font-semibold text-text">{c.record(model.record.won, model.record.total)}</p>
						<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
							{model.recent.map((p) => (
								<li key={`${p.fixtureId}-${p.selection}`} className="flex items-center gap-3 px-4 py-2.5">
									<span
										className={cn(
											'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
											p.status === 'won' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-loss'
										)}
										aria-label={p.status === 'won' ? c.won : c.lost}
									>
										{p.status === 'won' ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-bold text-text">
											{p.home} – {p.away}
										</span>
										<span className="block truncate text-xs text-muted">{p.selection}</span>
									</span>
									{p.score && <span className="shrink-0 text-sm font-bold tabular-nums text-text">{p.score}</span>}
								</li>
							))}
						</ul>
					</>
				) : (
					<p className="mt-2 text-sm text-muted">{c.recordEmpty}</p>
				)}
				<Link href={accuracyHref({ kind: 'hint', days: '30' })} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline hover:underline">
					{c.accuracy}
					<ArrowRight size={14} aria-hidden="true" />
				</Link>
			</section>

			<LeagueLinks items={aktywne} locale={locale} title={c.others} currentId={d.league.id} />

			<Link
				href="/typy-na-dzis"
				className="mt-8 inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] border border-border px-4 py-2.5 text-sm font-bold text-text no-underline transition-colors hover:border-accent hover:bg-accent-soft"
			>
				{c.all}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>

			<section className="mt-10">
				<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.howTitle}</h2>
				<p className="mt-2 text-sm leading-relaxed text-text">{c.how}</p>
				<p className="mt-4 text-xs text-muted">{c.disclaimer}</p>
			</section>
		</AppShell>
	);
}
