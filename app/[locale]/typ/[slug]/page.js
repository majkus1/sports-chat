import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowRight, Check, Lock, Sparkles, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import PickUnlock from '@/components/match-preview/PickUnlock';
import { Link } from '@/i18n/routing';
import connectToDb from '@/lib/db';
import ModelForecast from '@/models/ModelForecast';
import DailyPick from '@/models/DailyPick';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbLd } from '@/lib/seo/jsonLd';
import { SITE_URL } from '@/lib/seo/config';
import { localDate, localMidnight } from '@/lib/time';
import { cn } from '@/lib/utils';
import {
	fixtureIdFromSlug,
	matchPath,
	matchPreviewContent,
	matchSlug,
	pickOutcome,
	previewLeague,
	previewNumbers,
	sportsEventLd,
} from '@/lib/seo/matchPreview';

/**
 * Strona „typ na mecz" — indeksowana, z dziennika prognoz. Opis w `lib/seo/matchPreview.js`.
 *
 * Dziesięć minut w pamięci podręcznej: liczby przed meczem się nie zmieniają (pierwsza
 * prognoza zostaje), a po meczu dochodzi tylko wynik. Robot może chodzić po tych stronach
 * do woli — każda to jedno zapytanie do bazy, zero do dostawcy danych.
 */
export const revalidate = 600;

const wczytaj = cache(async (slug) => {
	const id = fixtureIdFromSlug(slug);
	if (!id) return null;
	try {
		await connectToDb();
		return await ModelForecast.findOne({ fixtureId: id }).lean();
	} catch {
		return null;
	}
});

export async function generateMetadata({ params }) {
	const { locale, slug } = await params;
	const f = await wczytaj(slug);
	if (!f) return buildMetadata({ locale, path: `/typ/${slug}`, title: locale === 'en' ? 'Match' : 'Mecz', noindex: true });
	const c = matchPreviewContent(locale);
	const when = c.when(f.kickoff, locale);
	const n = previewNumbers(f, locale);
	return buildMetadata({
		locale,
		path: matchPath(f),
		title: c.title(f.homeName, f.awayName, when.data),
		description: Number.isFinite(n.home) ? c.description(f.homeName, f.awayName, n, previewLeague(f), when) : undefined,
	});
}

/** Pasek szansy: nazwa, procent, wypełnienie. Najwyższa szansa w kolorze akcentu. */
function Szansa({ label, value, top }) {
	return (
		<li className="flex flex-col gap-1">
			<span className="flex items-baseline justify-between gap-3 text-sm">
				<span className={cn('truncate', top ? 'font-bold text-text' : 'text-text')}>{label}</span>
				<span className="font-bold tabular-nums text-text">{value}%</span>
			</span>
			<span className="h-2 overflow-hidden rounded-full bg-surface-2">
				<span className={cn('block h-full rounded-full', top ? 'bg-accent' : 'bg-border-strong')} style={{ width: `${value}%` }} />
			</span>
		</li>
	);
}

export default async function Page({ params }) {
	const { locale, slug } = await params;
	const f = await wczytaj(slug);
	if (!f) notFound();
	// Jeden adres na mecz: inna pisownia nazw w linku prowadzi na właściwy.
	if (slug !== matchSlug(f)) permanentRedirect(`/${locale}${matchPath(f)}`);

	const c = matchPreviewContent(locale);
	const when = c.when(f.kickoff, locale);
	const n = previewNumbers(f, locale);
	const liga = previewLeague(f);
	const rozpoczety = Date.parse(f.kickoff) <= Date.now();
	const wynik = Number.isFinite(f.result?.home) && Number.isFinite(f.result?.away) ? `${f.result.home}:${f.result.away}` : null;
	const outcome = pickOutcome(f);
	const hint = f.hint?.key ? f.hint : null;

	const dzien = localDate(new Date(f.kickoff));
	const odPolnocy = localMidnight(dzien);
	const doPolnocy = localMidnight(localDate(new Date(odPolnocy.getTime() + 36 * 3600_000)));
	const [dzienny, inne] = await Promise.all([
		DailyPick.findOne({ fixtureId: f.fixtureId }).select('_id').lean().catch(() => null),
		ModelForecast.find({ kickoff: { $gte: odPolnocy, $lt: doPolnocy }, fixtureId: { $ne: f.fixtureId } })
			.select('fixtureId homeName awayName kickoff leagueId leagueName leagueCountry')
			.sort({ kickoff: 1 })
			.limit(12)
			.lean()
			.catch(() => []),
	]);
	// Typ odkryty: typ dnia zawsze, każdy inny — od pierwszego gwizdka (wtedy nic już nie odbiera płacącym).
	const odkryty = hint && (dzienny || rozpoczety);
	const szanse = Number.isFinite(n.home)
		? [
				{ label: f.homeName, value: n.home },
				{ label: c.draw, value: n.draw },
				{ label: f.awayName, value: n.away },
			]
		: [];
	const maks = Math.max(...szanse.map((s) => s.value));
	const path = matchPath(f);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: c.home, path: '/' },
					{ name: c.today, path: '/typy-na-dzis' },
					{ name: `${f.homeName} – ${f.awayName}`, path },
				])}
			/>
			<script type="application/ld+json" dangerouslySetInnerHTML={sportsEventLd({ forecast: f, url: `${SITE_URL}/${locale}${path}`, name: `${f.homeName} – ${f.awayName}` })} />

			<p className="text-xs font-bold uppercase tracking-wide text-muted">
				{[liga, `${when.dzien}, ${when.godzina}`].filter(Boolean).join(' · ')}
			</p>
			<h1 className="mt-2 font-display text-3xl font-bold leading-tight text-text sm:text-4xl">{c.h1(f.homeName, f.awayName)}</h1>
			{wynik && (
				<p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold text-text">
					{c.result}: <span className="tabular-nums">{wynik}</span>
				</p>
			)}

			{/* Typ modelu — najważniejsze na stronie, więc pierwsze. */}
			<section className="mt-6 rounded-[var(--radius-ui)] border border-accent/50 bg-surface p-5 shadow-[var(--shadow-soft)]">
				<h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
					<Sparkles size={13} aria-hidden="true" />
					{dzienny && hint ? c.daily : c.pickTitle}
				</h2>
				<div className="mt-3">
					{odkryty ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="rounded-[var(--radius-ui)] bg-accent px-3 py-2 text-base font-bold text-accent-fg">{hint.selection}</span>
							<span className="text-2xl font-bold tabular-nums text-text">{hint.probability}%</span>
							<span className="text-sm text-muted">
								({c.usually} {Math.round(hint.base)}%)
							</span>
							<span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-bold tabular-nums text-accent">+{hint.lift}</span>
							{outcome && (
								<span
									className={cn(
										'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
										outcome === 'won' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-loss'
									)}
								>
									{outcome === 'won' ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
									{outcome === 'won' ? c.won : c.lost}
								</span>
							)}
						</div>
					) : hint ? (
						<PickUnlock fixtureId={f.fixtureId} date={dzien} usually={c.usually}>
							<p className="flex items-start gap-2 text-sm leading-relaxed text-text">
								<Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
								<span>
									{c.locked}{' '}
									<Link href="/cennik" className="font-semibold text-accent underline">
										{c.plans}
									</Link>
								</span>
							</p>
						</PickUnlock>
					) : (
						<p className="text-sm leading-relaxed text-text">{rozpoczety ? c.noneAfter : c.none}</p>
					)}
				</div>
			</section>

			{szanse.length > 0 && (
				<section className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_200px]">
					<div>
						<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.chances}</h2>
						<ul className="mt-3 flex flex-col gap-3">
							{szanse.map((s) => (
								<Szansa key={s.label} label={s.label} value={s.value} top={s.value === maks} />
							))}
						</ul>
					</div>
					{n.lambdaHome && (
						<div>
							<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.expectedGoals}</h2>
							<p className="mt-3 font-display text-3xl font-bold tabular-nums text-text">
								{n.lambdaHome} – {n.lambdaAway}
							</p>
						</div>
					)}
				</section>
			)}

			<Link
				href={`/mecz/${f.fixtureId}`}
				className="mt-6 inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] border border-border px-4 py-2.5 text-sm font-bold text-text no-underline transition-colors hover:border-accent hover:bg-accent-soft"
			>
				{c.room}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>

			{inne.length > 0 && (
				<section className="mt-10">
					<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.others}</h2>
					<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
						{inne.map((o) => (
							<li key={o.fixtureId}>
								<Link href={matchPath(o)} className="flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-2">
									<span className="w-11 shrink-0 text-sm font-bold tabular-nums text-text">{c.when(o.kickoff, locale).godzina}</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-bold text-text">
											{o.homeName} – {o.awayName}
										</span>
										{previewLeague(o) && <span className="block truncate text-xs text-muted">{previewLeague(o)}</span>}
									</span>
									<ArrowRight size={15} aria-hidden="true" className="shrink-0 text-border-strong" />
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="mt-10">
				<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.howTitle}</h2>
				<p className="mt-2 text-sm leading-relaxed text-text">{c.how}</p>
				<p className="mt-4 text-xs text-muted">{c.disclaimer}</p>
			</section>
		</AppShell>
	);
}
