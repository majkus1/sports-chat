import { ArrowRight, Lock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { matchPath } from '@/lib/seo/matchPreview';
import { PRO_WEEK } from '@/lib/billing/plans';
import { openRegister } from '@/components/landing/RegisterCta';

const PRZYCISK =
	'inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90';

/**
 * Druga karta obok typu dnia na stronie głównej — najmocniejszy INNY typ modelu na ten dzień,
 * za kłódką.
 *
 * Mecz, godzina i liga są odkryte, typ i procent nie: widać, że model ma więcej, niż daje za
 * darmo, i dokładnie przy którym meczu. W planie z liczbami (Pro, VIP, okres próbny) ten sam
 * typ jest odkryty — wtedy zamiast tej karty stoi zwykła `DailyPickCard`.
 *
 * Zamazane kropki to atrapa, nie ukryty typ: przy kłódce trasa w ogóle nie wysyła selekcji,
 * więc nie da się jej odczytać z kodu strony.
 *
 * Przycisk (22.11.2026): gość zakłada konto („Odkryj typ za darmo" — okres próbny odkrywa ten
 * typ), zalogowany bez planu idzie do cennika z podświetlonym Pro na 7 dni. Wcześniej gość też
 * trafiał do cennika, gdzie i tak musiał najpierw założyć konto. `unlockGuest` — etykieta dla
 * gościa; bez niej `c.unlockGuest` z treści „Typów na dziś", a na końcu `c.unlock`.
 */
export default function LockedPickCard({ pick, c, label, locale, guest = false, unlockGuest, className }) {
	const etykietaGoscia = unlockGuest || c.unlockGuest || c.unlock;
	const godzina = new Date(pick.kickoff).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		hour: '2-digit',
		minute: '2-digit',
	});

	return (
		<article
			className={cn(
				'flex flex-col overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]',
				className
			)}
		>
			<div className="px-5 pb-4 pt-4 sm:px-6">
				<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
					<Lock size={12} aria-hidden="true" />
					{label || c.lockedLabel}
				</p>
				<h2 className="mt-2 font-display text-2xl font-bold leading-tight text-text sm:text-3xl">
					<Link
						href={matchPath({ fixtureId: pick.fixtureId, homeName: pick.home, awayName: pick.away })}
						className="text-text no-underline decoration-2 underline-offset-4 hover:underline"
					>
						{pick.home} – {pick.away}
					</Link>
				</h2>
				<p className="mt-1 text-sm text-muted">
					{godzina}
					{pick.league ? ` · ${pick.league}` : ''}
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-2" aria-hidden="true">
					<span className="select-none rounded-[var(--radius-ui)] border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-base font-bold tracking-widest text-muted blur-[3px]">
						●●●●●●●●
					</span>
					<span className="select-none text-2xl font-bold text-muted blur-[3px]">●●%</span>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-muted">{c.lockedNote}</p>
			</div>

			<div className="mt-auto px-5 pb-5 sm:px-6">
				{guest ? (
					// Gość: okres próbny odkrywa ten typ za darmo, więc przycisk zakłada konto, a nie wysyła do cennika.
					<button type="button" onClick={openRegister} className={cn(PRZYCISK, 'cursor-pointer border-0 font-sans')}>
						{etykietaGoscia}
						<ArrowRight size={15} aria-hidden="true" />
					</button>
				) : (
					// Zalogowany bez planu z liczbami: prosto do najtańszego biletu, podświetlonego w cenniku.
					<Link href={`/cennik?oferta=${PRO_WEEK.id}`} className={PRZYCISK}>
						<Lock size={14} aria-hidden="true" />
						{c.unlock}
						<ArrowRight size={15} aria-hidden="true" />
					</Link>
				)}
			</div>
		</article>
	);
}
