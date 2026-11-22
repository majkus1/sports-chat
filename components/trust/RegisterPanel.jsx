'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Clock, Lock, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import Verdict from '@/components/trust/Verdict';
import MoreDetails from '@/components/stats/MoreDetails';
import { useSelectionText } from '@/components/trust/useSelectionText';
import { cn } from '@/lib/utils';
import { isPageParam } from '@/lib/urlState';
import { replaceSearchParams, useUrlState } from '@/lib/hooks/useUrlState';
import { useScrollMemory } from '@/lib/hooks/useScrollMemory';
import {
	DEFAULT_LEAGUE,
	DEFAULT_MARKET,
	DEFAULT_PERIOD,
	isLeagueParam,
	REGISTER_MARKETS,
	REGISTER_PERIODS,
} from '@/lib/trust/params';
import {
	clvTone,
	formatDateTime,
	formatOdds,
	formatShare,
	formatSignedPct,
	leadMessage,
} from '@/lib/trust/format';

/**
 * Rejestr typów AI — zakładka strony skuteczności (`?view=register`).
 *
 * KOLEJNOŚĆ EKRANU: na wierzchu to, co gracz łapie w trzy sekundy — werdykt, cztery liczby
 * (najpierw trafienia, bo tę rozumie każdy), jedna linia „zapisane przed gwizdkiem" z liczbą
 * odrzuconych i lista typów. Dowody dla dociekliwych (CLV po ludzku, przekroje okresów, rodzajów
 * typów i lig, pełne zasady) są niżej w zwiniętych sekcjach — w HTML-u, ale nie w strumieniu.
 *
 * PRZEGRANA WYGLĄDA JAK WYGRANA. Ten sam wiersz, ta sama wielkość, ta sama pozycja; różni się
 * tylko kolor plakietki. Rejestr, w którym chybienia są szare i drobne, kłamie krojem pisma.
 *
 * Filtry w adresie (`period`, `market`, `league`, `page`) jak reszta widoków (`lib/urlState`):
 * „Wstecz" z meczu i wysłany link otwierają ten sam wybór. Zmiana filtra wraca na stronę 1.
 */

const PILL =
	'whitespace-nowrap rounded-full border-0 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const SELECT =
	'h-9 max-w-full rounded-full border border-border bg-surface-2 px-3 text-xs font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:max-w-[16rem]';

function Pills({ label, items, value, onChange, labelFor }) {
	return (
		<div className="flex min-w-0 max-w-full flex-col gap-1">
			<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
			<div className="flex max-w-full flex-wrap items-center gap-0.5 self-start rounded-[1.25rem] border border-border bg-surface-2 p-1">
				{items.map((k) => (
					<button
						key={k}
						type="button"
						onClick={() => onChange(k)}
						aria-pressed={value === k}
						className={cn(
							PILL,
							value === k ? 'bg-brand text-brand-fg shadow-sm' : 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
						)}
					>
						{labelFor(k)}
					</button>
				))}
			</div>
		</div>
	);
}

/** Kafel jednej liczby: duża wartość, podpis, jedno zdanie kontekstu. */
function Stat({ label, value, hint, tone = 'text-text' }) {
	return (
		<Card className="h-full">
			<CardContent className="flex h-full flex-col gap-1 px-4 py-4">
				<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
				<span className={cn('font-display text-3xl font-bold tabular-nums sm:text-4xl', tone)}>{value}</span>
				{hint && <span className="text-xs leading-snug text-muted">{hint}</span>}
			</CardContent>
		</Card>
	);
}

/** Tabela przekroju (okresy / rynki / ligi). Na telefonie przewija się w poziomie w obrębie karty. */
function Breakdown({ title, note, firstCol, rows, labelFor, t, locale, onPick }) {
	if (!rows?.length) return null;
	return (
		<Card>
			<CardContent className="px-0 py-4">
				<div className="px-4">
					<h3 className="text-sm font-bold text-text">{title}</h3>
					{note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
				</div>
				<div className="mt-2 overflow-x-auto">
					<table className="w-full min-w-[30rem] border-collapse text-sm">
						<thead>
							<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
								<th scope="col" className="px-4 py-1.5 font-semibold">{firstCol}</th>
								<th scope="col" className="px-2 py-1.5 text-right font-semibold">{t('col_picks')}</th>
								<th scope="col" className="px-2 py-1.5 text-right font-semibold">{t('col_hits')}</th>
								<th scope="col" className="px-2 py-1.5 text-right font-semibold">{t('col_clv')}</th>
								<th scope="col" className="px-2 py-1.5 text-right font-semibold">{t('col_beat')}</th>
								<th scope="col" className="px-4 py-1.5 text-right font-semibold">{t('col_roi')}</th>
							</tr>
						</thead>
						<tbody className="tabular-nums">
							{rows.map((r) => (
								<tr key={r.key} className="border-t border-border">
									<th scope="row" className="max-w-[12rem] truncate px-4 py-2 text-left font-normal text-text">
										{onPick ? (
											<button type="button" onClick={() => onPick(r.key)} className="truncate border-0 bg-transparent p-0 text-left text-text underline-offset-2 hover:underline">
												{labelFor(r)}
											</button>
										) : (
											labelFor(r)
										)}
									</th>
									<td className="px-2 py-2 text-right text-muted">{r.total}</td>
									<td className="px-2 py-2 text-right text-text">
										{r.settled ? `${formatShare(r.hitRate, locale)}` : '—'}
										<span className="ml-1 text-xs text-muted">{r.settled ? `${r.won}/${r.settled}` : ''}</span>
									</td>
									<td className={cn('px-2 py-2 text-right font-semibold', clvTone(r.clvMean))}>
										{r.clvN ? formatSignedPct(r.clvMean, locale, 2) : '—'}
									</td>
									<td className="px-2 py-2 text-right text-text">{r.clvN ? formatShare(r.beat, locale) : '—'}</td>
									<td className={cn('px-4 py-2 text-right', clvTone(r.roi))}>
										{r.withOdds ? formatSignedPct(r.roi, locale) : '—'}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}

function StatusBadge({ status, t }) {
	if (status === 'won') return <Badge variant="win" className="shrink-0">{t('status_won')}</Badge>;
	if (status === 'lost') return <Badge variant="loss" className="shrink-0">{t('status_lost')}</Badge>;
	return <Badge variant="neutral" className="shrink-0">{t('status_pending')}</Badge>;
}

/** Jeden typ. Ten sam układ dla wygranej, przegranej i oczekującej — różni się tylko plakietka. */
function RegisterRow({ row, t, locale, selectionText }) {
	const lead = leadMessage(row.leadMinutes);
	const leadText = lead ? t(lead.key, lead.values) : '';
	const opublikowano = formatDateTime(row.publishedAt, locale);
	const mecz = formatDateTime(row.kickoff, locale);
	const liga = [row.leagueName, row.country && !String(row.leagueName || '').includes(row.country) ? row.country : null]
		.filter(Boolean)
		.join(' · ');

	if (row.locked) {
		return (
			<li className="flex flex-col gap-1 py-3">
				<div className="flex items-center justify-between gap-2 text-xs text-muted">
					<span className="truncate">{[mecz, liga].filter(Boolean).join(' · ')}</span>
					<Badge variant="outline" className="shrink-0">
						<Lock size={11} aria-hidden="true" />
						{t(`kind_${row.kind}`)}
					</Badge>
				</div>
				<p className="text-sm font-semibold text-text">
					{row.homeName} – {row.awayName}
				</p>
				<p className="flex items-center gap-1.5 text-xs text-muted">
					<Clock size={12} aria-hidden="true" className="shrink-0" />
					{t('locked', { time: opublikowano, lead: leadText })}
				</p>
			</li>
		);
	}

	const wynik = row.score ? `${row.score.home}–${row.score.away}` : '–';
	return (
		<li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className="flex items-center gap-2 text-xs text-muted">
					<span className="truncate">{[mecz, liga].filter(Boolean).join(' · ')}</span>
				</div>
				<Link href={`/mecz/${row.fixtureId}`} className="truncate text-sm font-semibold text-text no-underline hover:underline">
					{row.homeName} <span className="tabular-nums">{wynik}</span> {row.awayName}
				</Link>
				<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text">
					<span>{selectionText(row)}</span>
					<span className="text-xs text-muted">
						{t(`kind_${row.kind}`)}
						{Number.isFinite(row.probability) ? ` · ${t('model_chance', { p: row.probability })}` : ''}
					</span>
				</p>
			</div>

			<div className="flex items-center gap-1.5 text-xs text-muted sm:flex-col sm:items-start sm:gap-0">
				<span className="inline-flex items-center gap-1 text-text">
					<Clock size={12} aria-hidden="true" className="shrink-0 text-muted" />
					{opublikowano}
				</span>
				<span>· {t('lead', { lead: leadText })}</span>
			</div>

			<div className="flex items-center justify-between gap-3 sm:justify-end">
				<div className="flex flex-col text-xs tabular-nums sm:items-end">
					<span className="text-text">
						{row.refOdds ? formatOdds(row.refOdds, locale) : t('no_odds')}
						<span className="mx-1 text-muted" aria-hidden="true">→</span>
						{row.closeOdds ? formatOdds(row.closeOdds, locale) : '—'}
						{row.refSource === 'publish' && <span className="ml-1 text-muted">({t('ref_publish')})</span>}
					</span>
					<span className={cn('font-semibold', clvTone(row.clv))}>
						{Number.isFinite(row.clv) ? `${t('col_clv')} ${formatSignedPct(row.clv, locale)}` : t('no_clv')}
					</span>
				</div>
				<StatusBadge status={row.status} t={t} />
			</div>
		</li>
	);
}

/**
 * @param {{ rememberScroll?: boolean }} props
 */
export default function RegisterPanel({ rememberScroll = false }) {
	const t = useTranslations('trust');
	// Etykiety rozwijanych sekcji w przestrzeni pakietu UX — `trust` ma te same klucze w obu językach (test).
	const tp = useTranslations('ux_p4');
	const locale = useLocale();
	const selectionText = useSelectionText();

	const [period] = useUrlState('period', { allowed: REGISTER_PERIODS, fallback: DEFAULT_PERIOD });
	const [market] = useUrlState('market', { allowed: REGISTER_MARKETS, fallback: DEFAULT_MARKET });
	const [league] = useUrlState('league', { allowed: isLeagueParam, fallback: DEFAULT_LEAGUE });
	const [pageRaw] = useUrlState('page', { allowed: isPageParam, fallback: '1' });
	const page = Number(pageRaw);

	const [data, setData] = useState(null);
	const [error, setError] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(false);
		const params = new URLSearchParams({ period, market, league, page: String(page) });
		fetch(`/api/stats/register?${params}`)
			.then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
			.then((json) => {
				if (!cancelled) setData(json);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [period, market, league, page]);

	useScrollMemory(rememberScroll, !isLoading);

	// Zmiana filtra zaczyna od pierwszej strony — inaczej „strona 7" w nowym wyborze bywa pusta.
	const ustaw = (key, value, fallback) =>
		replaceSearchParams({ [key]: value === fallback ? null : value, page: null });
	const naStrone = (n) => {
		replaceSearchParams({ page: n <= 1 ? null : String(n) });
		document.getElementById('register-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const s = data?.summary;
	const okres = (k) => t(`period_${k}`);
	const nazwaLigi = (l) => [l.name, l.country && !String(l.name || '').includes(l.country) ? l.country : null].filter(Boolean).join(', ');

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">{t('register_title')}</h2>
				<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('register_intro')}</p>
			</div>

			<div className="flex flex-wrap items-end gap-x-4 gap-y-3">
				<Pills label={t('filter_period')} items={REGISTER_PERIODS} value={period} onChange={(v) => ustaw('period', v, DEFAULT_PERIOD)} labelFor={okres} />
				{/* Rodzaj typu — lista wyboru zamiast pięciu pigułek: jedna grupa pigułek na ekran wystarczy. */}
				<label className="flex min-w-0 max-w-full flex-col gap-1">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('filter_market')}</span>
					<select value={market} onChange={(e) => ustaw('market', e.target.value, DEFAULT_MARKET)} className={SELECT}>
						{REGISTER_MARKETS.map((k) => (
							<option key={k} value={k}>
								{t(`market_${k}`)}
							</option>
						))}
					</select>
				</label>
				<label className="flex min-w-0 max-w-full flex-col gap-1">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('filter_league')}</span>
					<select
						value={league}
						onChange={(e) => ustaw('league', e.target.value, DEFAULT_LEAGUE)}
						className={SELECT}
					>
						<option value="all">{t('league_all')}</option>
						{(data?.leagues || []).map((l) => (
							<option key={l.key} value={l.key}>
								{nazwaLigi(l)} ({l.n})
							</option>
						))}
						{/* Liga z adresu, której nie ma na liście (stary link) — żeby wybór nie znikał bez śladu. */}
						{league !== 'all' && data && !data.leagues?.some((l) => l.key === league) && <option value={league}>#{league}</option>}
					</select>
				</label>
			</div>

			{error && !data ? (
				<p className="rounded-[var(--radius-ui)] border border-border bg-surface px-4 py-3 text-sm text-muted">{t('error')}</p>
			) : !data ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-14 w-full" />
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-28 w-full" />
						))}
					</div>
					<Skeleton className="h-64 w-full" />
				</div>
			) : (
				<div className={cn('flex flex-col gap-5 transition-opacity', isLoading && 'opacity-60')} aria-busy={isLoading}>
					<Verdict clv={s.clv} />

					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<Stat
							label={t('sum_hits')}
							value={s.settled ? formatShare(s.hitRate, locale) : t('sum_none')}
							hint={
								s.settled
									? t('sum_hits_hint', { won: s.won, settled: s.settled, low: s.interval?.low ?? '—', high: s.interval?.high ?? '—' })
									: null
							}
						/>
						<Stat
							label={t('sum_beat')}
							value={s.clv.n ? formatShare(s.clv.beat, locale) : t('sum_none')}
							hint={s.clv.n ? t('sum_beat_hint', { same: formatShare(s.clv.same, locale), worse: formatShare(s.clv.worse, locale) }) : null}
						/>
						<Stat
							label={t('sum_clv')}
							value={s.clv.n ? formatSignedPct(s.clv.mean, locale, 2) : t('sum_none')}
							tone={clvTone(s.clv.mean)}
							hint={
								s.clv.n
									? t('sum_clv_hint', {
											n: s.clv.n,
											low: formatSignedPct(s.clv.low, locale, 2) ?? '—',
											high: formatSignedPct(s.clv.high, locale, 2) ?? '—',
										})
									: null
							}
						/>
						<Stat
							label={t('sum_roi')}
							value={s.withOdds ? formatSignedPct(s.roi, locale) : t('sum_none')}
							tone={clvTone(s.roi)}
							hint={
								s.withOdds
									? t('sum_roi_hint', {
											n: s.withOdds,
											odds: formatOdds(s.avgOdds, locale),
											taxed: formatSignedPct(s.roiTaxed, locale),
										})
									: null
							}
						/>
					</div>

					{/* Najmocniejszy dowód w jednej linii — reszta zasad w „Zasadach rejestru" niżej. */}
					<p className="flex items-start gap-2 text-sm leading-relaxed text-text">
						<ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
						<span>{t('rule_before', { count: data.rules.afterKickoff, checked: data.rules.checked })}</span>
					</p>

					<Card id="register-list" className="scroll-mt-20">
						<CardContent className="px-4 py-4 sm:px-5">
							<h3 className="text-sm font-bold text-text">{t('list_title')}</h3>
							{data.upcoming > 0 && <p className="mt-1 text-xs text-muted">{t('upcoming_note', { count: data.upcoming })}</p>}
							{data.items.length ? (
								<ul className="mt-1 flex flex-col divide-y divide-border">
									{data.items.map((row) => (
										<RegisterRow key={row.id} row={row} t={t} locale={locale} selectionText={selectionText} />
									))}
								</ul>
							) : (
								<p className="mt-3 text-sm text-muted">{t('empty')}</p>
							)}

							{data.pages > 1 && (
								<nav aria-label={t('page_info', { page: data.page, pages: data.pages, total: data.total })} className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
									<button
										type="button"
										onClick={() => naStrone(data.page - 1)}
										disabled={data.page <= 1}
										className="inline-flex h-10 items-center gap-1 rounded-[var(--radius-ui)] border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
									>
										<ChevronLeft size={16} aria-hidden="true" />
										<span className="hidden sm:inline">{t('prev')}</span>
									</button>
									<span className="text-xs tabular-nums text-muted">
										{t('page_info', { page: data.page, pages: data.pages, total: data.total })}
									</span>
									<button
										type="button"
										onClick={() => naStrone(data.page + 1)}
										disabled={data.page >= data.pages}
										className="inline-flex h-10 items-center gap-1 rounded-[var(--radius-ui)] border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
									>
										<span className="hidden sm:inline">{t('next')}</span>
										<ChevronRight size={16} aria-hidden="true" />
									</button>
								</nav>
							)}
						</CardContent>
					</Card>

					{/*
					 * Dla dociekliwych — zwinięte, ale w HTML-u: CLV po ludzku, przekroje i pełne zasady.
					 * Gracz ma najpierw zobaczyć liczby i listę typów, a nie lekcję ekonomii.
					 */}
					<div className="flex flex-col gap-2">
						<MoreDetails summary={tp('clv_more')}>
							<p className="text-sm leading-relaxed text-muted">{t('clv_why_1')}</p>
							<p className="text-sm leading-relaxed text-muted">{t('clv_why_2')}</p>
							<p className="text-sm leading-relaxed text-muted">{t('clv_why_3')}</p>
							<p className="rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs tabular-nums text-text">{t('clv_why_formula')}</p>
						</MoreDetails>

						<MoreDetails summary={tp('breakdowns_more')}>
							<Breakdown
								title={t('periods_title')}
								firstCol={t('col_period')}
								rows={data.periods.filter((r) => r.total > 0)}
								labelFor={(r) => okres(r.key)}
								onPick={(k) => ustaw('period', k, DEFAULT_PERIOD)}
								t={t}
								locale={locale}
							/>
							<Breakdown
								title={t('markets_title')}
								firstCol={t('col_market')}
								rows={data.byMarket}
								labelFor={(r) => t(`market_${r.key}`)}
								onPick={(k) => ustaw('market', k, DEFAULT_MARKET)}
								t={t}
								locale={locale}
							/>
							<Breakdown
								title={t('leagues_title')}
								note={t('leagues_more')}
								firstCol={t('col_league')}
								rows={data.byLeague}
								labelFor={nazwaLigi}
								onPick={(k) => ustaw('league', k, DEFAULT_LEAGUE)}
								t={t}
								locale={locale}
							/>
						</MoreDetails>

						{/* Zasady z liczbami — „nie dopisujemy typów po meczu" ma być sprawdzalne, nie obiecane. */}
						<MoreDetails summary={tp('rules_more')}>
							<ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
								<li>{t('rule_once')}</li>
								<li>{t('rule_live', { count: data.rules.live })}</li>
								<li>{t('rule_ref')}</li>
								<li>{t('rule_close')}</li>
								<li>{t('rule_missing', { share: formatShare(s.coverage, locale) ?? '—' })}</li>
								<li>{t('rule_scope')}</li>
							</ul>
						</MoreDetails>
					</div>

					<p className="text-xs leading-relaxed text-muted">{t('disclaimer')}</p>
				</div>
			)}
		</div>
	);
}
