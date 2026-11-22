'use client';

import { useId } from 'react';
import { ChevronDown, Lightbulb, Loader2, TicketPlus } from 'lucide-react';
import { customImpossibleText } from '@/lib/coupons/content';
import { cn } from '@/lib/utils';

/**
 * Karta „Tak się nie da, ale możemy…" w kreatorze kuponu — zamiast czerwonego „nie da się".
 *
 * Najpierw powód po ludzku (to samo zdanie co u asystenta, `customImpossibleText`), potem 1–3 propozycje
 * z serwera (`lib/coupons/alternatives.js`): co zmieniamy, dlaczego to działa (liczby z puli), zapowiedź
 * kuponu (kurs łączny, szansa, liczba meczów, mecze pod rozwinięciem) i jeden przycisk, który składa
 * kupon z tymi ustawieniami. Pierwsza propozycja — najbliższa prośbie — ma przycisk wyróżniony.
 *
 * Zapowiedź to NIE gotowy kupon: przed pokazaniem AI sprawdza wiadomości, więc karta mówi to wprost,
 * razem z tym, że limit zejdzie dopiero przy złożonym kuponie. Teksty: przestrzeń `builder2` w `messages`.
 *
 * KRÓCEJ (22.11.2026): bez zdania wstępu nad listą („Propozycja 1, 2…" mówi to samo), a notka
 * o zapowiedzi i o limicie w jednym akapicie pod listą.
 */

/** Pole, od którego zaczyna się „dlaczego to działa" — liczby z puli są najbardziej konkretne. */
const KOLEJNOSC_POWODU = ['window', 'leagues', 'skipPublished', 'legs', 'odds'];

function opisZmiany(t2, b, c) {
	const kurs = (id) => b.oddsOptions.find((o) => o.id === id)?.label ?? id;
	switch (c.field) {
		case 'window':
			return t2('change_window', { to: b.window[c.to] ?? c.to, from: b.window[c.from] ?? c.from });
		case 'legs':
			return t2('change_legs', { to: c.to, from: c.from });
		case 'odds':
			return t2('change_odds', { to: kurs(c.to), from: kurs(c.from) });
		case 'leagues':
			return t2('change_leagues');
		default:
			return t2('change_skipPublished');
	}
}

function powod(t2, b, alt) {
	const zakres = b.oddsOptions.find((o) => o.id === alt.params.odds)?.range ?? '';
	const glowna = KOLEJNOSC_POWODU.find((f) => alt.changes.some((c) => c.field === f));
	if (glowna === 'window' || glowna === 'leagues') {
		return t2(`why_${glowna}`, { after: alt.picks?.after ?? 0, before: alt.picks?.before ?? 0 });
	}
	if (glowna === 'skipPublished') return t2('why_skipPublished');
	return t2(glowna === 'legs' ? 'why_legs' : 'why_odds', { range: zakres });
}

function Liczba({ label, children }) {
	return (
		<div className="min-w-0 rounded-[var(--radius-ui)] bg-surface-2 px-2.5 py-1.5">
			<dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt>
			<dd className="m-0 font-display text-base font-bold tabular-nums text-text">{children}</dd>
		</div>
	);
}

function Propozycja({ alt, n, b, t2, locale, pierwsza, laduje, ta, brakLimitu, onAccept, notatkaId }) {
	const tytulId = useId();
	const naglowek = alt.changes.map((c) => opisZmiany(t2, b, c)).join(' · ');
	const godzina = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
	const p = alt.preview;
	return (
		<li
			aria-labelledby={tytulId}
			className={cn(
				'flex flex-col gap-3 rounded-[var(--radius-ui)] border bg-surface p-4',
				pierwsza ? 'border-accent/60 shadow-[var(--shadow-soft)]' : 'border-border'
			)}
		>
			<div className="min-w-0">
				<p className="text-[11px] font-bold uppercase tracking-wide text-accent">{t2('proposal', { n })}</p>
				<p id={tytulId} className="mt-0.5 text-sm font-bold leading-snug text-text">
					{naglowek}
				</p>
				<p className="mt-1 text-xs leading-relaxed text-muted">{powod(t2, b, alt)}</p>
			</div>

			<dl className="m-0 grid grid-cols-3 gap-2">
				<Liczba label={t2('stats_odds')}>{b.odds(p.totalOdds)}</Liczba>
				<Liczba label={t2('stats_chance')}>{p.chance}%</Liczba>
				<Liczba label={t2('stats_matches')}>{p.legs.length}</Liczba>
			</dl>

			<details className="group rounded-[var(--radius-ui)] border border-border/70 px-3 py-2">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-text [&::-webkit-details-marker]:hidden">
					<span>
						{t2('matches')} · {t2('stats_legs', { count: p.legs.length })}
					</span>
					<ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
				</summary>
				<ul className="mt-2 flex flex-col gap-1.5">
					{p.legs.map((l) => (
						<li key={l.fixtureId} className="flex items-baseline justify-between gap-3 text-xs">
							<span className="min-w-0">
								<span className="block truncate font-semibold text-text">
									{l.homeName} – {l.awayName}
								</span>
								<span className="block truncate text-muted">
									{godzina.format(new Date(l.kickoff))} · {l.selection}
								</span>
							</span>
							<span className="shrink-0 font-bold tabular-nums text-text">{b.odds(l.odds)}</span>
						</li>
					))}
				</ul>
			</details>

			<button
				type="button"
				onClick={() => onAccept(alt, n - 1)}
				disabled={laduje || brakLimitu}
				aria-busy={ta || undefined}
				aria-label={t2('acceptAria', { n, label: naglowek })}
				aria-describedby={notatkaId}
				className={cn(
					'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-ui)] px-4 py-2.5 text-sm font-bold transition-colors sm:w-fit',
					'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
					pierwsza
						? 'bg-accent text-accent-fg hover:bg-accent-hover'
						: 'border border-border-strong bg-transparent text-text hover:bg-surface-2'
				)}
			>
				{ta ? (
					<Loader2 size={16} aria-hidden="true" className="motion-safe:animate-spin" />
				) : (
					<TicketPlus size={16} aria-hidden="true" />
				)}
				{ta ? t2('accepting') : t2('accept')}
			</button>
		</li>
	);
}

export default function CouponAlternatives({ b, t2, wynik, locale, laduje, przyjmowana, brakLimitu, onAccept }) {
	const tytulId = useId();
	const notatkaId = useId();
	const t = customImpossibleText(locale, wynik);
	return (
		<section
			aria-labelledby={tytulId}
			aria-live="polite"
			className="rounded-[var(--radius-ui)] border border-accent/40 bg-gradient-to-b from-accent-soft/40 to-surface-2/40 p-4 text-sm"
		>
			<div className="flex items-start gap-3">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
					<Lightbulb size={18} />
				</span>
				<div className="min-w-0">
					<h4 id={tytulId} className="font-display text-base font-bold leading-snug text-text">
						{t2('title')}
					</h4>
					<p className="mt-1 leading-relaxed text-text/90">{t.reason}</p>
				</div>
			</div>

			{wynik.fromProposal && <p className="mt-3 text-xs leading-relaxed text-muted">{t2('stillImpossible')}</p>}
			{wynik.dropped?.length > 0 && (
				<div className="mt-3 text-xs leading-relaxed text-muted">
					<p className="font-semibold text-text">{b.droppedLabel}</p>
					<ul className="mt-0.5 flex flex-col gap-0.5">
						{wynik.dropped.map((d) => (
							<li key={d.fixtureId}>
								{d.homeName} – {d.awayName} ({d.selection}){d.reason ? ` — ${d.reason}` : ''}
							</li>
						))}
					</ul>
				</div>
			)}
			{t.partial && <p className="mt-2 text-xs text-muted">{t.partial}</p>}

			<ol className="mt-4 flex list-none flex-col gap-3 p-0">
				{wynik.alternatives.map((alt, i) => (
					<Propozycja
						key={JSON.stringify(alt.params)}
						alt={alt}
						n={i + 1}
						b={b}
						t2={t2}
						locale={locale}
						pierwsza={i === 0}
						laduje={laduje}
						ta={laduje && przyjmowana === i}
						brakLimitu={brakLimitu}
						onAccept={onAccept}
						notatkaId={notatkaId}
					/>
				))}
			</ol>

			<p id={notatkaId} className="mt-3 text-xs leading-relaxed text-muted">
				{t2('previewNote')} <span className="font-semibold text-accent">{b.noCharge}</span>
			</p>
			{brakLimitu && <p className="mt-2 text-xs font-semibold text-text">{t2('noLimit')}</p>}
		</section>
	);
}
