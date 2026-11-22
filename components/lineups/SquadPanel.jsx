import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, ShieldAlert, Shirt, Target, UserX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * Sekcja „Składy" — pokój meczowy (zakładka, z pakietu meczu) i strona meczu `/typ` (z zapisu przy meczu).
 *
 * Bez `'use client'` i bez stanu: ten sam komponent renderuje się na serwerze (strona meczu) i u klienta
 * (zakładka). Kształt danych z `squadView` (`lib/football/lineups.js`) — jeden dla obu miejsc.
 *
 * KOLEJNOŚĆ OD NAJWAŻNIEJSZEGO, bo na telefonie widać pierwszy ekran: wniosek (czy któraś drużyna gra
 * osłabiona), potem po karcie na drużynę — siła składu, nieobecni, wyjściowa jedenastka.
 */

/** Wniosek o jednej drużynie — to samo, co decyduje o wecie (`lineupVeto`), tylko słowami. */
function wniosek(t, team) {
	const m = team.measure;
	if (!m?.reliable) return { ton: 'muted', text: t('conclusion_unknown', { team: team.name }) };
	if (m.weakened) {
		const powody = [];
		if (m.missingCore >= 3) powody.push(t('reason_missing_core', { count: m.missingCore }));
		if (m.missingGoalkeeper) powody.push(t('reason_goalkeeper'));
		if (m.missingTopScorer) powody.push(`${t('reason_top_scorer')}${team.topScorer?.name ? ` (${team.topScorer.name})` : ''}`);
		if (team.rotation) powody.push(t('rotation'));
		return { ton: 'warn', text: t('conclusion_weakened', { team: team.name, reasons: powody.join(', ') }) };
	}
	if (m.missingCore > 0) return { ton: 'muted', text: t('conclusion_some', { team: team.name, missing: m.missingCore, core: m.coreSize }) };
	return { ton: 'ok', text: t('conclusion_ok', { team: team.name }) };
}

function Wnioski({ view, t }) {
	const wiersze = [wniosek(t, view.home), wniosek(t, view.away)];
	const ikona = { warn: AlertTriangle, ok: CheckCircle2, muted: HelpCircle };
	return (
		<ul className="flex flex-col gap-1.5">
			{wiersze.map((w) => {
				const Ikona = ikona[w.ton];
				return (
					<li
						key={w.text}
						className={cn(
							'flex items-start gap-2 rounded-[var(--radius-ui)] px-3 py-2 text-sm leading-snug',
							w.ton === 'warn' ? 'bg-draw/10 font-semibold text-text' : 'bg-surface-2 text-text'
						)}
					>
						<Ikona
							size={16}
							aria-hidden="true"
							className={cn('mt-px shrink-0', w.ton === 'warn' ? 'text-draw' : w.ton === 'ok' ? 'text-accent' : 'text-muted')}
						/>
						<span className="[overflow-wrap:anywhere]">{w.text}</span>
					</li>
				);
			})}
		</ul>
	);
}

/** Pasek siły składu: udział podstawowych (ważony liczbą występów), którzy grają. */
function Sila({ t, measure }) {
	if (!measure?.reliable || !Number.isFinite(measure.strength)) {
		return <p className="text-xs text-muted">{t('unknown_regulars')}</p>;
	}
	const v = Math.max(0, Math.min(100, measure.strength));
	return (
		<div className="flex flex-col gap-1">
			<p className="flex items-baseline justify-between gap-3 text-xs">
				<span className="font-semibold uppercase tracking-wide text-muted">{t('strength')}</span>
				<span className={cn('text-sm font-bold tabular-nums', measure.weakened ? 'text-draw' : 'text-text')}>{v}%</span>
			</p>
			<span className="h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
				<span className={cn('block h-full rounded-full', measure.weakened ? 'bg-draw' : 'bg-accent')} style={{ width: `${v}%` }} />
			</span>
			<p className="text-xs text-muted">{t('missing_core', { missing: measure.missingCore, core: measure.coreSize })}</p>
		</div>
	);
}

function Rola({ t, player }) {
	if (player.goalkeeper) {
		return (
			<span className="inline-flex items-center gap-0.5 rounded bg-draw/15 px-1 py-px text-[10px] font-bold uppercase text-draw">
				<ShieldAlert size={10} aria-hidden="true" />
				{t('goalkeeper')}
			</span>
		);
	}
	if (player.topScorer) {
		return (
			<span className="inline-flex items-center gap-0.5 rounded bg-draw/15 px-1 py-px text-[10px] font-bold uppercase text-draw">
				<Target size={10} aria-hidden="true" />
				{t('top_scorer')}
			</span>
		);
	}
	return null;
}

function Druzyna({ t, team, confirmed }) {
	return (
		<Card className={cn(team.measure?.weakened && 'border-draw/60')}>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h4 className="text-sm font-bold text-text">{team.name}</h4>
					{team.measure?.weakened && (
						<span className="inline-flex items-center gap-1 rounded-full bg-draw/15 px-2 py-0.5 text-[11px] font-bold text-draw">
							<AlertTriangle size={12} aria-hidden="true" />
							{t('weakened')}
						</span>
					)}
				</div>

				<Sila t={t} measure={team.measure} />

				<div>
					<p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted">
						<UserX size={12} aria-hidden="true" />
						{t('absent')}
					</p>
					{team.absent.length ? (
						<ul className="flex flex-col gap-1 text-sm">
							{team.absent.map((p) => (
								<li key={`${p.id ?? p.name}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
									<span className={cn('text-text', p.regular && 'font-semibold')}>{p.name}</span>
									<Rola t={t} player={p} />
									<span className="text-xs text-muted">
										{[t(`kind_${p.kind || 'absent'}`), p.reason].filter(Boolean).join(' · ')}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-xs text-muted">{t('no_absent')}</p>
					)}
					{team.doubtful?.length > 0 && (
						<p className="mt-1.5 text-xs text-muted">
							<span className="font-semibold">{t('doubtful')}:</span> {team.doubtful.map((d) => d.name).filter(Boolean).join(', ')}
						</p>
					)}
				</div>

				{confirmed && team.startXI.length > 0 && (
					<div>
						<p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted">
							<Shirt size={12} aria-hidden="true" />
							{t('starting_xi')}
							{team.formation ? <span className="font-semibold normal-case tracking-normal">· {t('formation', { formation: team.formation })}</span> : null}
						</p>
						<ol className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm min-[420px]:grid-cols-2">
							{team.startXI.map((p) => (
								<li key={p.id || p.name} className="flex min-w-0 items-center gap-2">
									<span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{p.number ?? ''}</span>
									<span className="truncate text-text">{p.name}</span>
									{p.regular && (
										<span className="size-1.5 shrink-0 rounded-full bg-accent" title={t('regular')} aria-label={t('regular')} />
									)}
								</li>
							))}
						</ol>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * @param {{ view: object|null, updatedAt?: string|Date|null, locale?: string, className?: string }} props
 *   `view` z `squadView`; `null` albo `stage: 'none'` — komunikat „jeszcze niedostępne"
 */
export default function SquadPanel({ view, updatedAt = null, locale = 'pl', className }) {
	const t = useTranslations('lineups');
	if (!view || view.stage === 'none') {
		return <p className={cn('px-1 py-6 text-center text-sm text-muted', className)}>{t('no_data')}</p>;
	}
	const confirmed = view.stage === 'confirmed';
	const godzina = updatedAt
		? new Date(updatedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' })
		: null;
	return (
		<div className={cn('flex flex-col gap-3', className)}>
			<div className="flex flex-wrap items-center gap-2">
				<span
					className={cn(
						'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
						confirmed ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
					)}
				>
					{confirmed ? <CheckCircle2 size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
					{confirmed ? t('stage_confirmed') : t('stage_expected')}
				</span>
				{godzina && <span className="text-xs text-muted">{t('updated', { time: godzina })}</span>}
			</div>
			{!confirmed && <p className="text-xs leading-relaxed text-muted">{t('stage_expected_hint')}</p>}

			<Wnioski view={view} t={t} />

			<div className="grid gap-3 sm:grid-cols-2">
				<Druzyna t={t} team={view.home} confirmed={confirmed} />
				<Druzyna t={t} team={view.away} confirmed={confirmed} />
			</div>

			<p className="text-xs leading-relaxed text-muted">
				{t('regular_legend')} {t('note')}
			</p>
		</div>
	);
}

/** Krótkie ostrzeżenie nad analizą — tylko gdy któraś drużyna gra osłabiona. */
export function SquadAlert({ view, className }) {
	const t = useTranslations('lineups');
	if (!view || view.stage === 'none') return null;
	const osl = [view.home, view.away].filter((x) => x?.measure?.weakened);
	if (!osl.length) return null;
	return (
		<div className={cn('flex items-start gap-2 rounded-[var(--radius-ui)] border border-draw/50 bg-draw/10 px-3 py-2 text-sm text-text', className)}>
			<AlertTriangle size={16} aria-hidden="true" className="mt-px shrink-0 text-draw" />
			<span className="[overflow-wrap:anywhere]">{osl.map((team) => wniosek(t, team).text).join(' ')}</span>
		</div>
	);
}

/** Notka przy nodze kuponu albo typie dnia: drużyna typu gra osłabiona (zapis w obu językach). */
export function LineupWarningNote({ note, locale = 'pl', after = false, className }) {
	const t = useTranslations('lineups');
	const tekst = note ? (locale === 'en' ? note.en || note.pl : note.pl || note.en) : null;
	if (!tekst) return null;
	return (
		<span className={cn('mt-0.5 flex items-start gap-1 text-[11px] font-semibold leading-snug text-draw', className)}>
			<AlertTriangle size={12} aria-hidden="true" className="mt-px shrink-0" />
			<span className="[overflow-wrap:anywhere]">
				{tekst}
				{after ? <span className="font-normal text-muted"> — {t('leg_warning_after')}</span> : null}
			</span>
		</span>
	);
}
