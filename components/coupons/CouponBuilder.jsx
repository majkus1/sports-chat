'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { ArrowRight, History, Loader2, Lock, ShieldAlert, SlidersHorizontal, TicketPlus, TriangleAlert } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { UserContext, useAuthKey } from '@/context/UserContext';
import CouponCard from '@/components/coupons/CouponCard';
import { Switch } from '@/components/ui/Switch';
import { couponBuilderContent, couponContent, customImpossibleText } from '@/lib/coupons/content';
import {
	CUSTOM_DEFAULTS,
	CUSTOM_LEGS,
	CUSTOM_WINDOWS,
	customOdds,
	minLegsFor,
	parseCustomParams,
	windowOpen,
} from '@/lib/coupons/custom';
import { LEAGUE_GROUPS } from '@/lib/football/leagues';
import { cn } from '@/lib/utils';

/**
 * Kreator kuponu na „Typach na dziś" (`lib/coupons/custom.js`, trasa `POST /api/coupons/generate`).
 *
 * Kilka pigułek zamiast formularza: kurs łączny, najwyżej ile meczów, kiedy mecze się zaczynają,
 * ligi i „bez meczów z kuponów serwisu". Wynik to ta sama karta co kupony serwisu (`CouponCard`) —
 * kurs łączny i szansa modelu obok siebie, notki terminarza, informacja o sprawdzeniu wiadomości —
 * albo uczciwe „nie da się" z powodem i podpowiedzią (limit wtedy nie schodzi).
 *
 * DOSTĘP z serwera: gość i plan bez kreatora widzą zapowiedź z cennikiem; o licznik „zostało X z Y"
 * pytamy `/api/coupons/mine?limit=0`. Sama trasa i tak sprawdza plan i limit — przycisk nic nie obchodzi.
 *
 * OSTATNIE USTAWIENIA zostają w `localStorage` (w try/catch — prywatne okno, zablokowane dane):
 * to wygoda jednej przeglądarki, nie stan, który musi przetrwać.
 */

const PAMIEC = 'czat:kreator-kuponu';

function czytajUstawienia() {
	try {
		const zapis = JSON.parse(window.localStorage.getItem(PAMIEC) || 'null');
		const wynik = zapis ? parseCustomParams(zapis) : null;
		return wynik?.ok ? wynik.params : null;
	} catch {
		return null;
	}
}

function zapiszUstawienia(params) {
	try {
		window.localStorage.setItem(PAMIEC, JSON.stringify(params));
	} catch {
		/* bez pamięci przeglądarki kreator po prostu zaczyna od domyślnych */
	}
}

function Pigulka({ on, disabled = false, onClick, children, title }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			disabled={disabled}
			title={title}
			onClick={onClick}
			className={cn(
				'inline-flex min-h-9 items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
				on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2 text-text hover:border-accent',
				disabled && 'cursor-not-allowed opacity-45 hover:border-border'
			)}
		>
			{children}
		</button>
	);
}

function Grupa({ label, children, note }) {
	return (
		<fieldset className="min-w-0">
			<legend className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</legend>
			<div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
			{note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>}
		</fieldset>
	);
}

export default function CouponBuilder({ locale, className }) {
	const b = couponBuilderContent(locale);
	const karta = { ...couponContent(locale), newsChecked: b.newsChecked };
	const { isAuthed } = useContext(UserContext) || {};
	const authKey = useAuthKey();

	const [ustawienia, setUstawienia] = useState(CUSTOM_DEFAULTS);
	const [teraz, setTeraz] = useState(null);
	const [dostep, setDostep] = useState(null);
	const [laduje, setLaduje] = useState(false);
	const [wynik, setWynik] = useState(null);
	const [blad, setBlad] = useState(null);
	const zamontowany = useRef(true);
	const wczytane = useRef(false);

	useEffect(() => {
		zamontowany.current = true;
		return () => {
			zamontowany.current = false;
		};
	}, []);

	// Czas i pamięć przeglądarki dopiero po zamontowaniu — HTML z serwera ma być taki sam dla wszystkich.
	useEffect(() => {
		const now = new Date();
		setTeraz(now);
		const zapis = czytajUstawienia();
		if (zapis) setUstawienia(zapis);
		// Po 22:00 „dziś" jest puste — bez zapisanych ustawień zaczynamy od najbliższych 24 godzin.
		else if (!windowOpen(CUSTOM_DEFAULTS.window, now)) setUstawienia((u) => ({ ...u, window: 'h24' }));
		wczytane.current = true;
		const id = setInterval(() => setTeraz(new Date()), 60_000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		if (wczytane.current) zapiszUstawienia(ustawienia);
	}, [ustawienia]);

	useEffect(() => {
		if (!authKey || authKey === 'guest') {
			setDostep(authKey === 'guest' ? { access: false, guest: true } : null);
			return undefined;
		}
		let anulowane = false;
		/*
		 * Nieudane sprawdzenie dostępu to nie „brak planu": pokazujemy kreator bez licznika, a o planie
		 * i limicie i tak rozstrzyga trasa przy złożeniu (403 przełączy kartę na zapowiedź).
		 */
		const bezLicznika = { access: true, quota: null, failed: true };
		fetch('/api/coupons/mine?limit=0', { credentials: 'include', cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane) setDostep(d ? { access: Boolean(d.access), quota: d.quota } : bezLicznika);
			})
			.catch(() => {
				if (!anulowane) setDostep(bezLicznika);
			});
		return () => {
			anulowane = true;
		};
	}, [authKey]);

	const minimum = minLegsFor(customOdds(ustawienia.odds).target);
	const oknoOtwarte = !teraz || windowOpen(ustawienia.window, teraz);
	const quota = dostep?.quota;
	const brakLimitu = quota && quota.limit !== null && quota.remaining <= 0;

	const zmien = (zmiana) => {
		setUstawienia((u) => {
			const nowe = { ...u, ...zmiana };
			// Kurs ~3,0 potrzebuje czterech meczów — podnosimy, zamiast zostawić przycisk, który i tak „nie da się".
			const min = minLegsFor(customOdds(nowe.odds).target);
			if (nowe.legs < min) nowe.legs = min;
			return nowe;
		});
	};

	const przelaczLige = (id) => {
		setUstawienia((u) => {
			const wybrane = u.leagues.includes(id) ? u.leagues.filter((g) => g !== id) : [...u.leagues, id];
			const uporzadkowane = LEAGUE_GROUPS.map((g) => g.id).filter((g) => wybrane.includes(g));
			return { ...u, leagues: uporzadkowane.length === LEAGUE_GROUPS.length ? [] : uporzadkowane };
		});
	};

	const zloz = async () => {
		setLaduje(true);
		setBlad(null);
		try {
			const res = await fetch('/api/coupons/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ params: ustawienia }),
			});
			const dane = await res.json().catch(() => null);
			if (!zamontowany.current) return;
			if (dane?.quota) setDostep((d) => ({ ...(d || {}), access: true, quota: dane.quota }));
			if (res.status === 403) {
				setDostep({ access: false });
				return;
			}
			if (res.status === 429) {
				setBlad(b.limitReached(dane?.quota?.limit ?? quota?.limit ?? 0));
				return;
			}
			if (res.status === 409) {
				setBlad(b.busy);
				return;
			}
			if (!res.ok || !dane) {
				setBlad(b.error);
				return;
			}
			setWynik(dane);
		} catch {
			if (zamontowany.current) setBlad(b.error);
		} finally {
			if (zamontowany.current) setLaduje(false);
		}
	};

	return (
		<section
			aria-labelledby="kreator-kuponu-tytul"
			className={cn('overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]', className)}
		>
			<div className="bg-gradient-to-b from-accent-soft/50 to-transparent px-5 pb-3 pt-4 sm:px-6">
				<h3 id="kreator-kuponu-tytul" className="flex flex-wrap items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-text">
					<SlidersHorizontal size={18} aria-hidden="true" className="text-accent" />
					{b.title}
					<span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-fg">{b.badge}</span>
				</h3>
				<p className="mt-1 text-sm leading-relaxed text-muted">{b.lead}</p>
			</div>

			<div className="px-5 pb-5 sm:px-6">
				{!dostep ? (
					// Sesja albo dostęp jeszcze się sprawdzają — szkielet zamiast kłódki, która mignęłaby płacącemu.
					<div className="flex flex-col gap-3 py-2" aria-hidden="true">
						<span className="h-9 w-3/4 rounded-full bg-surface-2" />
						<span className="h-9 w-2/3 rounded-full bg-surface-2" />
						<span className="h-10 w-40 rounded-[var(--radius-ui)] bg-surface-2" />
					</div>
				) : !dostep.access ? (
					<Zablokowany b={b} guest={dostep.guest || !isAuthed} />
				) : (
					<div className="flex flex-col gap-4 pt-1">
						<Grupa label={b.oddsLabel}>
							{b.oddsOptions.map((o) => (
								<Pigulka key={o.id} on={ustawienia.odds === o.id} onClick={() => zmien({ odds: o.id })}>
									<span>{o.label}</span>
									<span className={cn('text-xs font-normal', ustawienia.odds === o.id ? 'text-accent-fg/80' : 'text-muted')}>
										{o.range}
									</span>
								</Pigulka>
							))}
						</Grupa>

						<Grupa label={b.legsLabel} note={minimum > CUSTOM_LEGS.min ? b.legsMinNote(minimum, ustawienia.odds) : null}>
							{Array.from({ length: CUSTOM_LEGS.max - CUSTOM_LEGS.min + 1 }, (_, i) => CUSTOM_LEGS.min + i).map((n) => (
								<Pigulka key={n} on={ustawienia.legs === n} disabled={n < minimum} onClick={() => zmien({ legs: n })}>
									{n}
								</Pigulka>
							))}
						</Grupa>

						<Grupa label={b.windowLabel} note={oknoOtwarte ? b.hoursNote : null}>
							{CUSTOM_WINDOWS.map((w) => (
								<Pigulka key={w} on={ustawienia.window === w} onClick={() => zmien({ window: w })}>
									{b.window[w]}
								</Pigulka>
							))}
						</Grupa>
						{!oknoOtwarte && (
							<p className="-mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-loss">
								<TriangleAlert size={13} aria-hidden="true" className="mt-px shrink-0" />
								{b.windowClosed}
							</p>
						)}

						<Grupa label={b.leaguesLabel}>
							<Pigulka on={!ustawienia.leagues.length} onClick={() => zmien({ leagues: [] })}>
								{b.leaguesAll}
							</Pigulka>
							{LEAGUE_GROUPS.map((g) => (
								<Pigulka key={g.id} on={ustawienia.leagues.includes(g.id)} onClick={() => przelaczLige(g.id)}>
									{b.leagueGroups[g.id]}
								</Pigulka>
							))}
						</Grupa>

						<label className="flex items-start gap-3">
							<Switch
								checked={ustawienia.skipPublished}
								onCheckedChange={(v) => zmien({ skipPublished: Boolean(v) })}
								aria-describedby="kreator-bez-kuponow"
							/>
							<span className="min-w-0">
								<span className="block text-sm font-semibold text-text">{b.skipPublished}</span>
								<span id="kreator-bez-kuponow" className="block text-xs leading-relaxed text-muted">
									{b.skipPublishedHint}
								</span>
							</span>
						</label>

						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
							<button
								type="button"
								onClick={zloz}
								disabled={laduje || brakLimitu || !oknoOtwarte}
								className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] bg-accent px-5 py-3 text-base font-bold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
							>
								{laduje ? <Loader2 size={18} aria-hidden="true" className="motion-safe:animate-spin" /> : <TicketPlus size={18} aria-hidden="true" />}
								{b.submit}
							</button>
							{quota && (
								<p className="text-sm text-muted" aria-live="polite">
									{quota.limit === null ? b.unlimited : b.remaining(quota.remaining, quota.limit)}
									{quota.inTrial && (
										<span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">{b.trialBadge}</span>
									)}
								</p>
							)}
						</div>
						{brakLimitu && <p className="text-sm text-muted">{b.limitReached(quota.limit)}</p>}
						{laduje && (
							<p className="flex items-center gap-2 text-sm text-muted" role="status">
								<Loader2 size={15} aria-hidden="true" className="text-accent motion-safe:animate-spin" />
								{b.generating}
							</p>
						)}
						{blad && (
							<p className="text-sm text-loss" role="alert">
								{blad}
							</p>
						)}

						{wynik && !laduje && <Wynik b={b} karta={karta} wynik={wynik} locale={locale} />}

						<p className="text-xs leading-relaxed text-muted">{b.honest}</p>
						<Link
							href="/moje-kupony"
							className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
						>
							<History size={15} aria-hidden="true" />
							{b.myCoupons}
							<ArrowRight size={15} aria-hidden="true" />
						</Link>
					</div>
				)}
			</div>
		</section>
	);
}

function Wynik({ b, karta, wynik, locale }) {
	if (wynik.ok && wynik.coupon) {
		const k = wynik.coupon;
		return (
			<div className="flex flex-col gap-2" aria-live="polite">
				{k.params && <p className="text-xs text-muted">{b.paramsLine(k.params)}</p>}
				{wynik.repeated && <p className="rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs text-muted">{b.repeated}</p>}
				{k.newsSkipped && (
					<p className="flex items-start gap-1.5 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs text-muted">
						<ShieldAlert size={14} aria-hidden="true" className="mt-px shrink-0 text-draw" />
						{b.newsSkipped}
					</p>
				)}
				<CouponCard coupon={k} c={karta} label={b.resultLabel(k.createdAt)} locale={locale} />
			</div>
		);
	}
	const t = customImpossibleText(locale, wynik);
	return (
		<div className="rounded-[var(--radius-ui)] border border-border bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
			<p className="font-bold text-text">{b.impossibleTitle}</p>
			<p className="mt-1 leading-relaxed text-text/90">{t.reason}</p>
			{wynik.dropped?.length > 0 && (
				<div className="mt-2 text-xs leading-relaxed text-muted">
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
			{t.suggestions.length > 0 && (
				<p className="mt-2 text-xs leading-relaxed text-muted">
					<span className="font-semibold text-text">{b.suggestTitle}</span> {t.suggestions.join('; ')}.
				</p>
			)}
			<p className="mt-2 text-xs font-semibold text-accent">{b.noCharge}</p>
		</div>
	);
}

function Zablokowany({ b, guest }) {
	return (
		<div className="flex flex-col gap-3 pt-1">
			<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
				<Lock size={12} aria-hidden="true" />
				{b.locked.title}
			</p>
			<p className="text-sm leading-relaxed text-muted">{b.locked.body}</p>
			<Link
				href="/cennik"
				className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
			>
				<Lock size={14} aria-hidden="true" />
				{b.locked.unlock}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
			{guest && <p className="text-xs leading-relaxed text-muted">{b.locked.guest}</p>}
			<p className="text-xs leading-relaxed text-muted">{b.honest}</p>
		</div>
	);
}
