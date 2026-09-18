'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { BadgeCheck, Check, CircleHelp, ClipboardList, Flag, ListChecks, Minus, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { guideContent } from '@/lib/landing/guide';
import { cn } from '@/lib/utils';

/**
 * Modal „Przewodnik" — co to jest i jak z tego korzystać, na jednym ekranie.
 *
 * Serwis urósł do siedmiu zakładek i kilku warstw (plakietki, panel, raport, asystent,
 * Kolejka, skuteczność). Ktoś, kto wchodzi pierwszy raz z pytaniem „co dziś zagrać",
 * nie ma jak tego złożyć w całość. Ten modal pokazuje jedną ścieżkę: lista → (szukasz sam
 * albo bierzesz gotowe) → typ z dwiema liczbami → rozliczenie. Reszta to jedno zdanie
 * na zakładkę i jedno na plan. Treść w `lib/landing/guide.js`.
 *
 * Rozgałęzienie jest rysowane siatką i krawędziami, nie obrazkiem: skaluje się na telefon
 * (dwie gałęzie jedna pod drugą), dziedziczy motyw i tłumaczy się razem z resztą.
 */

const ADRESY = {
	przedmeczowe: '/pilka-nozna/przedmeczowe',
	live: '/pilka-nozna/live',
	'ai-agent': '/pilka-nozna/ai-agent',
	asystent: '/pilka-nozna/asystent',
	kolejka: '/pilka-nozna/kolejka',
	skutecznosc: '/pilka-nozna/skutecznosc',
};

/** Numerowany węzeł ścieżki: kółko z numerem, tytuł, treść. */
function Krok({ n, title, children, last = false }) {
	return (
		<li className="relative pl-12">
			<span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-fg">
				{n}
			</span>
			{/* Linia do następnego kroku — od spodu kółka do końca elementu. */}
			{!last && <span aria-hidden="true" className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px -translate-x-1/2 bg-border" />}
			<h3 className="pt-1 text-base font-bold text-text">{title}</h3>
			<div className="mt-1 pb-6 text-sm leading-relaxed text-muted">{children}</div>
		</li>
	);
}

/** Jedna gałąź rozwidlenia: etykieta i lista działań ze znaczkami. */
function Galaz({ label, items, tone }) {
	return (
		<div className={cn('rounded-[var(--radius-ui)] border p-4', tone === 'accent' ? 'border-accent/60 bg-accent-soft/40' : 'border-border bg-surface-2')}>
			<p className="text-[11px] font-bold uppercase tracking-wide text-text">{label}</p>
			<ul className="mt-2 flex flex-col gap-2">
				{items.map((it) => (
					<li key={it.text} className="flex gap-2.5 text-sm leading-relaxed text-text">
						<span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface text-[11px] font-bold text-accent">
							{it.mark}
						</span>
						<span>{it.text}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function GuideModal({ open, onClose }) {
	const locale = useLocale();
	const g = guideContent(locale);

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

	return (
		<div
			// Nad paskiem nawigacji (z-index 10000) i przełącznikiem języka (100001) — modal ma zakryć wszystko.
			className="fixed inset-0 z-[100010] flex items-start justify-center overflow-y-auto bg-[var(--overlay)] p-3 sm:p-6"
			onClick={onClose}
			role="presentation"
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="guide-title"
				onClick={(e) => e.stopPropagation()}
				className="relative my-4 w-full max-w-3xl rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]"
			>
				<button
					type="button"
					onClick={onClose}
					aria-label={g.close}
					className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface-2 text-muted transition-colors hover:text-text"
				>
					<X size={18} aria-hidden="true" />
				</button>

				<div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8">
					<div className="flex items-center gap-2 text-accent">
						<CircleHelp size={18} aria-hidden="true" />
						<span className="text-[11px] font-bold uppercase tracking-wide">Czat Sportowy</span>
					</div>
					<h2 id="guide-title" className="mt-1 pr-10 font-display text-2xl font-bold uppercase tracking-wide text-text">
						{g.title}
					</h2>
					<p className="mt-2 max-w-2xl text-base leading-relaxed text-text">{g.lead}</p>

					{/* ---------- ścieżka ---------- */}
					<h3 className="mt-8 text-[11px] font-bold uppercase tracking-wide text-muted">{g.flow.title}</h3>
					<ol className="mt-3">
						<Krok n="1" title={g.flow.start.title}>
							<p>{g.flow.start.body}</p>
							{/* Rozwidlenie: dwie gałęzie obok siebie, na telefonie jedna pod drugą. */}
							<div className="mt-3 grid gap-3 sm:grid-cols-2">
								<Galaz label={g.flow.fork.self.label} items={g.flow.fork.self.items} tone="accent" />
								<Galaz label={g.flow.fork.ready.label} items={g.flow.fork.ready.items} />
							</div>
						</Krok>
						<Krok n="2" title={g.flow.pick.title}>
							<p className="inline-block rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-text">
								{g.flow.pick.example}
							</p>
							<ul className="mt-3 flex flex-col gap-1.5">
								{g.flow.pick.explain.map((zdanie) => (
									<li key={zdanie} className="flex gap-2">
										<span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
										<span className="text-text">{zdanie}</span>
									</li>
								))}
							</ul>
						</Krok>
						<Krok n="3" title={g.flow.settle.title} last>
							<p>{g.flow.settle.body}</p>
						</Krok>
					</ol>

					{/* ---------- co typujemy ---------- */}
					<div className="grid gap-4 sm:grid-cols-2">
						<section className="rounded-[var(--radius-ui)] border border-border p-4">
							<h3 className="flex items-center gap-2 text-sm font-bold text-text">
								<BadgeCheck size={16} aria-hidden="true" className="text-accent" />
								{g.markets.title}
							</h3>
							<ul className="mt-2 flex flex-col gap-1.5">
								{g.markets.yes.map((m) => (
									<li key={m} className="flex items-center gap-2 text-sm text-text">
										<Check size={14} aria-hidden="true" className="shrink-0 text-accent" />
										{m}
									</li>
								))}
							</ul>
						</section>
						<section className="rounded-[var(--radius-ui)] border border-border p-4">
							<h3 className="flex items-center gap-2 text-sm font-bold text-text">
								<Minus size={16} aria-hidden="true" className="text-muted" />
								{g.markets.noTitle}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted">{g.markets.no}</p>
						</section>
					</div>

					{/* ---------- zakładki ---------- */}
					<h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-text">
						<ListChecks size={16} aria-hidden="true" className="text-accent" />
						{g.tabs.title}
					</h3>
					<ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
						{g.tabs.items.map((tab) => (
							<li key={tab.key} className="text-sm leading-relaxed">
								<Link href={ADRESY[tab.key]} onClick={onClose} className="font-semibold text-accent no-underline hover:underline">
									{tab.name}
								</Link>
								<span className="text-muted"> — {tab.body}</span>
							</li>
						))}
					</ul>

					{/* ---------- plany ---------- */}
					<h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-text">
						<Flag size={16} aria-hidden="true" className="text-accent" />
						{g.plans.title}
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-muted">{g.plans.free}</p>
					<p className="mt-1.5 text-sm leading-relaxed text-muted">
						{g.plans.pro}{' '}
						<Link href="/cennik" onClick={onClose} className="font-semibold text-accent underline">
							{g.plans.link}
						</Link>
					</p>

					<div className="mt-6 flex justify-end">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex items-center gap-2 rounded-[var(--radius-ui)] border-0 bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
						>
							<ClipboardList size={15} aria-hidden="true" />
							{g.close}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
