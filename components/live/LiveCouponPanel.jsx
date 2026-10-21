'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight, Loader2, Lock, Radio, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useAuthKey } from '@/context/UserContext';
import { liveContent } from '@/lib/live/content';
import { cn } from '@/lib/utils';

/**
 * Generator kuponu live na stronie „Na żywo" (`lib/live`).
 *
 * Plan z liczbami: kupon (albo najlepszy pojedynczy typ, albo „nic wartego uwagi") z minutą,
 * wynikiem, kursem live, szansą rynku i modelu oraz uzasadnieniem AI przy każdym typie.
 * Pozostali: karta z kłódką — co to jest i, jeśli kupon jest świeży, jego liczby bez meczów.
 */
export default function LiveCouponPanel() {
	const locale = useLocale();
	const c = liveContent(locale);
	const authKey = useAuthKey();
	const [dane, setDane] = useState(null);
	const [laduje, setLaduje] = useState(false);
	const [blad, setBlad] = useState(false);

	const pobierz = useCallback(async () => {
		setLaduje(true);
		setBlad(false);
		try {
			const res = await fetch('/api/live/coupon', { credentials: 'include', cache: 'no-store' });
			if (!res.ok) throw new Error(String(res.status));
			setDane(await res.json());
		} catch {
			setBlad(true);
		} finally {
			setLaduje(false);
		}
	}, []);

	useEffect(() => {
		if (authKey) pobierz();
	}, [authKey, pobierz]);

	const godzina = (iso) =>
		new Date(iso).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });

	return (
		<section className="mb-6 overflow-hidden rounded-[var(--radius-ui)] border border-accent/60 bg-surface shadow-[var(--shadow-soft)]" aria-labelledby="kupon-live">
			<div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-b from-accent-soft/60 to-transparent px-5 pb-3 pt-4 sm:px-6">
				<div className="min-w-0">
					<h2 id="kupon-live" className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-text">
						<Zap size={18} aria-hidden="true" className="text-accent" />
						{c.title}
						<span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-fg">{c.badge}</span>
					</h2>
					<p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{c.lead}</p>
				</div>
				{dane?.unlocked && (
					<button
						type="button"
						onClick={pobierz}
						disabled={laduje}
						className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent disabled:opacity-60"
					>
						<RefreshCw size={13} aria-hidden="true" className={cn(laduje && 'motion-safe:animate-spin')} />
						{c.refresh}
					</button>
				)}
			</div>

			<div className="px-5 pb-5 sm:px-6">
				{laduje && !dane ? (
					<p className="flex items-center gap-2 py-4 text-sm text-muted">
						<Loader2 size={16} aria-hidden="true" className="text-accent motion-safe:animate-spin" />
						{c.generating}
					</p>
				) : blad ? (
					<p className="py-3 text-sm text-loss">{c.error}</p>
				) : !dane ? null : !dane.unlocked ? (
					<Zablokowany c={c} teaser={dane.teaser} />
				) : (
					<Wynik c={c} wynik={dane.result} godzina={godzina} laduje={laduje} />
				)}
			</div>
		</section>
	);
}

function Zablokowany({ c, teaser }) {
	return (
		<div className="flex flex-col gap-3 pt-1">
			<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
				<Lock size={12} aria-hidden="true" />
				{c.lockedTitle}
			</p>
			{teaser && teaser.mode !== 'none' && (
				<p className="text-sm font-semibold text-text">{c.lockedReady(teaser.totalOdds, teaser.chance, teaser.legsCount)}</p>
			)}
			<p className="text-sm leading-relaxed text-muted">{c.lockedNote}</p>
			<Link
				href="/cennik"
				className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
			>
				<Lock size={14} aria-hidden="true" />
				{c.unlock}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</div>
	);
}

function Wynik({ c, wynik, godzina, laduje }) {
	if (!wynik) return null;
	const legs = wynik.mode === 'coupon' ? wynik.coupon.legs : wynik.mode === 'single' ? [wynik.single] : [];
	return (
		<div className={cn('flex flex-col gap-3 pt-1 transition-opacity', laduje && 'opacity-60')}>
			{wynik.mode === 'none' ? (
				<p className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">{c.none(wynik.analyzed)}</p>
			) : (
				<>
					<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
						<Sparkles size={13} aria-hidden="true" />
						{wynik.mode === 'coupon' ? c.couponLabel(godzina(wynik.generatedAt)) : c.singleLabel(godzina(wynik.generatedAt))}
					</p>
					<div className="flex flex-wrap items-end gap-x-7 gap-y-2">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{wynik.mode === 'coupon' ? c.totalOdds : c.odd}</p>
							<p className="mt-1 font-display text-4xl font-bold leading-none tabular-nums text-text sm:text-5xl">
								{c.odds(wynik.mode === 'coupon' ? wynik.coupon.totalOdds : wynik.single.odds)}
							</p>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.chance}</p>
							<p className="mt-1 font-display text-3xl font-bold leading-none tabular-nums text-accent sm:text-4xl">
								{wynik.mode === 'coupon' ? wynik.coupon.chance : wynik.single.model}%
							</p>
						</div>
						<p className="pb-0.5 text-sm text-muted">{c.legs(legs.length)}</p>
					</div>
					<ul className="mt-1 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border">
						{legs.map((l) => (
							<li key={`${l.fixtureId}-${l.key}`} className="flex items-start gap-3 px-4 py-3">
								<span className="mt-0.5 inline-flex w-11 shrink-0 flex-col items-center rounded-md bg-surface-2 py-1 leading-tight">
									<Radio size={11} aria-hidden="true" className="text-loss" />
									<span className="text-xs font-bold tabular-nums text-text">{l.minute}&apos;</span>
								</span>
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-bold leading-snug text-text [overflow-wrap:anywhere]">
										<Link href={`/mecz/${l.fixtureId}`} className="text-text no-underline hover:underline">
											{l.homeName} – {l.awayName}
										</Link>
										<span className="ml-1.5 whitespace-nowrap font-semibold tabular-nums text-muted">{l.liveScore}</span>
									</span>
									<span className="block text-xs text-muted">
										<span className="font-semibold text-accent">{l.selection}</span> · {c.chances(l.market, l.model)}
									</span>
									{l.why && <span className="mt-1 block text-xs leading-relaxed text-text/80">{l.why}</span>}
								</span>
								<span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-sm font-bold tabular-nums text-text">{c.odds(l.odds)}</span>
							</li>
						))}
					</ul>
				</>
			)}

			{wynik.rejected?.length > 0 && (
				<div className="text-xs leading-relaxed text-muted">
					<p className="font-semibold text-text">{c.rejected}</p>
					<ul className="mt-0.5 flex flex-col gap-0.5">
						{wynik.rejected.map((r) => (
							<li key={r.match + r.selection}>
								{r.match} ({r.selection}){r.reason ? ` — ${r.reason}` : ''}
							</li>
						))}
					</ul>
				</div>
			)}
			<p className="text-xs text-muted">
				{c.analyzed(wynik.analyzed, wynik.withOdds)}
				{!wynik.aiChecked && wynik.mode !== 'none' ? ` ${c.noAi}` : ''}
			</p>
			<p className="text-xs leading-relaxed text-muted">{c.warning}</p>
		</div>
	);
}
