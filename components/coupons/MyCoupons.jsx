'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Lock, TicketPlus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useAuthKey } from '@/context/UserContext';
import CouponCard from '@/components/coupons/CouponCard';
import { couponBuilderContent, couponContent } from '@/lib/coupons/content';

/**
 * „Moje kupony" — własne kupony z kreatora (`GET /api/coupons/mine`): bilans ze wszystkich i ostatnie
 * kupony z rozliczeniem, każdy z ustawieniami, z którymi powstał.
 *
 * Bilans stoi obok tego, co zapowiadał model (średnia szansa i kurs), żeby „weszło 2 z 10" dało się
 * od razu porównać z obietnicą — i z dopiskiem o małej próbie. Te kupony nie wchodzą do publicznej
 * skuteczności serwisu; mówimy to w nagłówku, bo to pierwsze pytanie, jakie się nasuwa.
 */

/** Poniżej tylu rozliczonych kuponów procent jeszcze nic nie mówi. */
const MALA_PROBA = 20;

export default function MyCoupons({ locale }) {
	const b = couponBuilderContent(locale);
	const m = b.mine;
	const karta = { ...couponContent(locale), newsChecked: b.newsChecked };
	const authKey = useAuthKey();
	const [dane, setDane] = useState(null);
	const [blad, setBlad] = useState(false);

	useEffect(() => {
		if (!authKey || authKey === 'guest') return undefined;
		let anulowane = false;
		setBlad(false);
		fetch('/api/coupons/mine', { credentials: 'include', cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((d) => {
				if (!anulowane) setDane(d);
			})
			.catch(() => {
				if (!anulowane) setBlad(true);
			});
		return () => {
			anulowane = true;
		};
	}, [authKey]);

	const doKreatora = (
		<Link
			href="/typy-na-dzis#kreator-kuponu"
			className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-ui)] bg-accent px-4 py-2.5 text-sm font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
		>
			<TicketPlus size={16} aria-hidden="true" />
			{m.toBuilder}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);

	let tresc;
	if (authKey === 'guest') {
		tresc = <p className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">{m.loginRequired}</p>;
	} else if (blad) {
		tresc = <p className="text-sm text-loss">{m.error}</p>;
	} else if (!dane) {
		tresc = (
			<div className="flex flex-col gap-3" aria-hidden="true">
				<span className="h-16 rounded-[var(--radius-ui)] bg-surface-2" />
				<span className="h-48 rounded-[var(--radius-ui)] bg-surface-2" />
			</div>
		);
	} else {
		const s = dane.summary;
		tresc = (
			<div className="flex flex-col gap-4">
				{s.total > 0 && (
					<div className="rounded-[var(--radius-ui)] border border-border bg-surface px-4 py-3">
						<p className="font-display text-lg font-bold text-text">
							{m.entered(s.won, s.settled)}
							{s.settled > 0 && s.settled < MALA_PROBA && (
								<span className="ml-2 align-middle text-xs font-normal text-muted">({m.small})</span>
							)}
						</p>
						{s.settled > 0 && s.avgChance !== null && <p className="mt-0.5 text-sm text-muted">{m.promised(s.avgChance, s.avgOdds)}</p>}
						{s.pending > 0 && <p className="mt-0.5 text-sm text-muted">{m.pending(s.pending)}</p>}
					</div>
				)}

				{!dane.access && (
					<div className="flex flex-col gap-2 rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3">
						<p className="flex items-center gap-1.5 text-sm font-semibold text-text">
							<Lock size={14} aria-hidden="true" />
							{b.locked.title}
						</p>
						<p className="text-sm leading-relaxed text-muted">{b.locked.body}</p>
						<Link href="/cennik" className="text-sm font-semibold text-accent no-underline hover:underline">
							{b.locked.unlock}
						</Link>
					</div>
				)}

				{dane.coupons.length === 0 ? (
					<p className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">{m.empty}</p>
				) : (
					<>
						<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{m.recent(dane.coupons.length)}</h2>
						<ul className="flex flex-col gap-4">
							{dane.coupons.map((k) => (
								<li key={k.key} className="flex flex-col gap-1.5">
									{k.params && <p className="text-xs text-muted">{b.paramsLine(k.params)}</p>}
									<CouponCard coupon={k} c={karta} label={b.resultLabel(k.createdAt)} locale={locale} compact />
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h1 className="font-display text-3xl font-bold leading-tight text-text">{m.title}</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted">{m.lead}</p>
			</div>
			{tresc}
			{authKey && authKey !== 'guest' && doKreatora}
			<p className="text-xs leading-relaxed text-muted">{b.honest}</p>
		</div>
	);
}
