'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight, BadgeCheck, Bot, List, MousePointerClick, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { guideContent } from '@/lib/landing/guide';
import { localDate } from '@/lib/time';

/**
 * Modal „Przewodnik" — w pięć sekund: co dostajesz i gdzie kliknąć.
 *
 * Jedna decyzja na ekranie: duży przycisk „Zobacz dzisiejsze typy". Wszystko nad nim ma do
 * niego przekonać — obietnica w tytule, dwie ŻYWE liczby (ile typów model ma dziś i jak
 * trafia w ostatnich 90 dniach), jeden przykładowy typ narysowany tak jak w aplikacji
 * i trzy kroki po kilka słów. Treść w `lib/landing/guide.js`.
 *
 * Liczby dociągamy dopiero po otwarciu. Brak którejś (np. mała próba skuteczności) chowa
 * kafelek zamiast pokazywać zero — pusta liczba przekonuje gorzej niż żadna.
 */

const ADRESY = {
	przedmeczowe: '/pilka-nozna/przedmeczowe',
	live: '/pilka-nozna/live',
	'ai-agent': '/pilka-nozna/ai-agent',
	asystent: '/pilka-nozna/asystent',
	kolejka: '/pilka-nozna/kolejka',
	skutecznosc: '/pilka-nozna/skutecznosc',
};

const IKONY = { list: List, click: MousePointerClick, check: BadgeCheck };

/** Poniżej tej liczby rozliczonych typów procent skuteczności nic nie znaczy — nie pokazujemy. */
const MIN_ROZLICZONYCH = 30;

function useLiveNumbers(open) {
	const [dzis, setDzis] = useState(null);
	const [skutecznosc, setSkutecznosc] = useState(null);

	useEffect(() => {
		if (!open) return undefined;
		let anulowane = false;
		fetch(`/api/football/model-hints?date=${localDate()}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane && d) setDzis(Number.isFinite(d.count) ? d.count : Object.keys(d.hints || {}).length);
			})
			.catch(() => {});
		fetch('/api/stats/picks?scope=global&days=90&author=ai')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				const s = d?.summary;
				if (!anulowane && s && s.settled >= MIN_ROZLICZONYCH) setSkutecznosc(s);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, [open]);

	return { dzis, skutecznosc };
}

export default function GuideModal({ open, onClose }) {
	const locale = useLocale();
	const g = guideContent(locale);
	const { dzis, skutecznosc } = useLiveNumbers(open);

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		// Tło nie przewija się pod modalem — na telefonie inaczej ucieka spod palca.
		const poprzedni = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = poprzedni;
		};
	}, [open, onClose]);

	if (!open) return null;

	const pokazDzis = Number.isFinite(dzis) && dzis > 0;
	const lift = g.example.probability - g.example.usual;

	return (
		<div
			// Nad paskiem nawigacji (z-index 10000) i przełącznikiem języka (100001) — modal ma zakryć wszystko.
			className="fixed inset-0 z-[100010] flex items-start justify-center overflow-y-auto bg-[var(--overlay)] p-3 sm:items-center sm:p-6"
			onClick={onClose}
			role="presentation"
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="guide-title"
				onClick={(e) => e.stopPropagation()}
				className="relative my-4 w-full max-w-xl overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]"
			>
				<button
					type="button"
					onClick={onClose}
					aria-label={g.close}
					className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface-2 text-muted transition-colors hover:text-text"
				>
					<X size={18} aria-hidden="true" />
				</button>

				{/* ---------- obietnica + żywe liczby ---------- */}
				<div className="bg-gradient-to-b from-accent-soft/60 to-transparent px-5 pb-5 pt-6 sm:px-7">
					<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
						<Sparkles size={13} aria-hidden="true" />
						{g.kicker}
					</p>
					<h2 id="guide-title" className="mt-2 pr-10 font-display text-2xl font-bold leading-tight text-text sm:text-[28px]">
						{g.title}
					</h2>

					{(pokazDzis || skutecznosc) && (
						<div className={`mt-4 grid gap-2.5 ${pokazDzis && skutecznosc ? 'grid-cols-2' : 'grid-cols-1'}`}>
							{pokazDzis && (
								<div className="rounded-[var(--radius-ui)] border border-border bg-surface px-3.5 py-3">
									<p className="font-display text-3xl font-bold tabular-nums text-accent">{dzis}</p>
									<p className="text-xs leading-snug text-muted">{g.live.today}</p>
								</div>
							)}
							{skutecznosc && (
								<div className="rounded-[var(--radius-ui)] border border-border bg-surface px-3.5 py-3">
									<p className="font-display text-3xl font-bold tabular-nums text-accent">{skutecznosc.hitRate}%</p>
									<p className="text-xs leading-snug text-muted">{g.live.accuracy}</p>
								</div>
							)}
						</div>
					)}
				</div>

				<div className="px-5 pb-6 sm:px-7">
					{/* ---------- przykładowy typ — narysowany jak w aplikacji ---------- */}
					<p className="text-[11px] font-bold uppercase tracking-wide text-muted">{g.example.label}</p>
					<div className="mt-1.5 rounded-[var(--radius-ui)] border border-border bg-surface-2 px-4 py-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-base font-bold text-text">{g.example.match}</span>
							<span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-fg tabular-nums">
								<Sparkles size={12} aria-hidden="true" />+{lift}
							</span>
						</div>
						<p className="mt-1 text-sm">
							<span className="font-semibold text-accent">{g.example.pick}</span>
							<span className="font-semibold text-text tabular-nums"> · {g.example.probability}%</span>
							<span className="text-muted"> ({locale === 'en' ? 'usually' : 'zwykle'} {g.example.usual}%)</span>
						</p>
					</div>
					<p className="mt-1.5 text-xs leading-relaxed text-muted">{g.example.caption}</p>

					{/* ---------- trzy kroki ---------- */}
					<ol className="mt-5 grid gap-3 sm:grid-cols-3">
						{g.steps.map((krok, i) => {
							const Ikona = IKONY[krok.icon];
							return (
								<li key={krok.title} className="flex gap-3 sm:flex-col sm:gap-2">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
										<Ikona size={17} aria-hidden="true" />
									</span>
									<div>
										<p className="text-sm font-bold text-text">
											<span className="text-accent">{i + 1}.</span> {krok.title}
										</p>
										<p className="text-xs leading-relaxed text-muted">{krok.body}</p>
									</div>
								</li>
							);
						})}
					</ol>

					<p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text">{g.threshold}</p>

					{/* ---------- jedna decyzja ---------- */}
					<div className="mt-5 flex flex-col gap-2 sm:flex-row">
						<Link
							href={ADRESY.przedmeczowe}
							onClick={onClose}
							className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-ui)] bg-accent px-5 py-3 text-base font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
						>
							{g.cta}
							<ArrowRight size={18} aria-hidden="true" />
						</Link>
						<Link
							href={ADRESY.asystent}
							onClick={onClose}
							className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] border border-border px-4 py-3 text-sm font-semibold text-text no-underline transition-colors hover:border-accent"
						>
							<Bot size={16} aria-hidden="true" />
							{g.ctaSecondary}
						</Link>
					</div>

					<div className="mt-4 flex flex-wrap items-center gap-1.5">
						<span className="mr-1 text-xs text-muted">{g.tabs.title}:</span>
						{g.tabs.items
							.filter((tab) => tab.key !== 'przedmeczowe' && tab.key !== 'asystent')
							.map((tab) => (
								<Link
									key={tab.key}
									href={ADRESY[tab.key]}
									onClick={onClose}
									className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text no-underline transition-colors hover:border-accent hover:text-accent"
								>
									{tab.name}
								</Link>
							))}
					</div>

					<p className="mt-4 text-[11px] leading-relaxed text-muted">{g.footnote}</p>
				</div>
			</div>
		</div>
	);
}
