import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Check, Minus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import AdminNav from '@/components/growth/AdminNav';
import { Link } from '@/i18n/routing';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { loadSignupReport } from '@/lib/growth/signupReport';
import { buildMetadata } from '@/lib/seo/metadata';
import { cn } from '@/lib/utils';

/**
 * Źródła rejestracji i aktywacja — strona tylko dla administratora (dla reszty 404, poza indeksem).
 *
 * Odpowiada na jedno pytanie: KTÓRY KANAŁ PRZYPROWADZA LUDZI, KTÓRZY ZOSTAJĄ. Sama liczba kont
 * myli — dziesięć kont z posta, z których nikt nie użył AI, jest warte mniej niż dwa z Google,
 * które wróciły następnego dnia. Dlatego każda grupa ma obok siebie konta, użycie AI i powroty.
 * Dane i rachunek w `lib/growth/signupReport.js`.
 */

export const dynamic = 'force-dynamic';

const OKRESY = [30, 90, 365];

export async function generateMetadata({ params }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'growth' });
	return buildMetadata({ locale, path: '/admin/zrodla', title: t('sources_title'), noindex: true });
}

const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);

/** Kafelek z jedną liczbą i odsetkiem pod nią. */
function Kafel({ label, value, note }) {
	return (
		<div className="rounded-[var(--radius-ui)] border border-border bg-surface px-4 py-3">
			<p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
			<p className="mt-1 font-display text-2xl font-bold tabular-nums text-text">{value}</p>
			{note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
		</div>
	);
}

/** Pasek odsetka — szybkie porównanie grup bez czytania liczb. */
function Pasek({ value }) {
	return (
		<span className="block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
			<span className="block h-full rounded-full bg-accent" style={{ width: `${value ?? 0}%` }} />
		</span>
	);
}

/** Wiersz grupy (kanał albo źródło): nazwa, konta i trzy miary aktywacji. */
function Grupa({ name, sub, g, t }) {
	const miary = [
		{ label: t('col_ai'), a: g.usedAi, b: g.accounts },
		{ label: t('col_d1'), a: g.returnedD1, b: g.d1Eligible },
		{ label: t('col_later'), a: g.returnedLater, b: g.accounts },
	];
	return (
		<li className="px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<span className="min-w-0">
					<span className="block truncate text-sm font-bold text-text">{name}</span>
					{sub && <span className="block truncate text-xs text-muted">{sub}</span>}
				</span>
				<span className="shrink-0 text-sm font-bold tabular-nums text-text">{t('accounts_n', { n: g.accounts })}</span>
			</div>
			<div className="mt-2 grid grid-cols-3 gap-3">
				{miary.map((m) => (
					<div key={m.label} className="min-w-0">
						<p className="flex items-baseline justify-between gap-1 text-[11px] text-muted">
							<span className="truncate">{m.label}</span>
							<span className="font-semibold tabular-nums text-text">
								{m.a}/{m.b}
							</span>
						</p>
						<Pasek value={pct(m.a, m.b)} />
					</div>
				))}
			</div>
		</li>
	);
}

function Znak({ ok, label }) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
				ok ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
			)}
		>
			{ok ? <Check size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}
			{label}
		</span>
	);
}

export default async function Page({ params, searchParams }) {
	const { locale } = await params;
	const session = await getAuthenticatedUser();
	if (!session) notFound();
	await connectToDb();
	const me = await User.findById(session.userId).select('role').lean();
	if (me?.role !== 'admin') notFound();

	const t = await getTranslations({ locale, namespace: 'growth' });
	const sp = (await searchParams) || {};
	const days = OKRESY.includes(Number(sp.days)) ? Number(sp.days) : 90;
	const r = await loadSignupReport({ days });
	const kanal = (c) => t(`channel_${c}`);
	const data = (iso) =>
		new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', {
			timeZone: 'Europe/Warsaw',
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<AdminNav active="sources" labels={{ posts: t('admin_nav_posts'), sources: t('admin_nav_sources'), aria: t('admin_nav_aria') }} />
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">{t('sources_title')}</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">{t('sources_lead')}</p>

			<div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('period_label')}>
				{OKRESY.map((d) => (
					<Link
						key={d}
						href={`/admin/zrodla?days=${d}`}
						aria-current={d === days ? 'true' : undefined}
						className={cn(
							'rounded-full border px-3 py-1 text-xs font-semibold no-underline transition-colors',
							d === days ? 'border-brand bg-brand text-brand-fg' : 'border-border text-muted hover:bg-surface-2 hover:text-text'
						)}
					>
						{t('period_days', { n: d })}
					</Link>
				))}
			</div>

			<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Kafel label={t('kpi_accounts')} value={r.total.accounts} />
				<Kafel label={t('kpi_used_ai')} value={r.total.usedAi} note={pct(r.total.usedAi, r.total.accounts) !== null ? `${pct(r.total.usedAi, r.total.accounts)}%` : null} />
				<Kafel
					label={t('kpi_d1')}
					value={`${r.total.returnedD1}/${r.total.d1Eligible}`}
					note={pct(r.total.returnedD1, r.total.d1Eligible) !== null ? `${pct(r.total.returnedD1, r.total.d1Eligible)}%` : null}
				/>
				<Kafel label={t('kpi_later')} value={r.total.returnedLater} note={pct(r.total.returnedLater, r.total.accounts) !== null ? `${pct(r.total.returnedLater, r.total.accounts)}%` : null} />
			</div>

			{r.total.accounts === 0 ? (
				<p className="mt-8 rounded-[var(--radius-ui)] border border-border bg-surface p-5 text-sm text-muted">{t('sources_empty')}</p>
			) : (
				<>
					<section className="mt-8" aria-labelledby="wg-kanalu">
						<h2 id="wg-kanalu" className="font-display text-xl font-bold uppercase tracking-wide text-text">
							{t('by_channel')}
						</h2>
						<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
							{r.byChannel.map((g) => (
								<Grupa key={g.channel} name={kanal(g.channel)} g={g} t={t} />
							))}
						</ul>
					</section>

					<section className="mt-8" aria-labelledby="wg-zrodla">
						<h2 id="wg-zrodla" className="font-display text-xl font-bold uppercase tracking-wide text-text">
							{t('by_source')}
						</h2>
						<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
							{r.bySource.map((g) => (
								<Grupa key={`${g.channel}|${g.source}`} name={g.source === g.channel ? kanal(g.channel) : g.source} sub={kanal(g.channel)} g={g} t={t} />
							))}
						</ul>
					</section>

					<section className="mt-8" aria-labelledby="ostatnie">
						<h2 id="ostatnie" className="font-display text-xl font-bold uppercase tracking-wide text-text">
							{t('recent')}
						</h2>
						<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
							{r.recent.map((w) => (
								<li key={w.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
									<span className="min-w-0">
										<span className="block truncate text-sm font-bold text-text">
											{w.username} <span className="font-normal text-muted">· {data(w.createdAt)}</span>
										</span>
										<span className="block truncate text-xs text-muted">
											{kanal(w.channel)}
											{w.source !== w.channel ? ` · ${w.source}` : ''}
											{w.landingPath ? ` · ${w.landingPath}` : ''}
										</span>
									</span>
									<span className="flex shrink-0 gap-1.5">
										<Znak ok={w.usedAi} label={t('chip_ai')} />
										<Znak ok={w.returnedD1} label={t('chip_d1')} />
										<Znak ok={w.returnedLater} label={t('chip_later')} />
									</span>
								</li>
							))}
						</ul>
					</section>
				</>
			)}

			<p className="mt-8 text-xs leading-relaxed text-muted">{t('sources_how')}</p>
		</AppShell>
	);
}
