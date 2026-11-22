'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Lock, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { matchPath } from '@/lib/seo/matchPreview';
import { useAuthKey } from '@/context/UserContext';
import GuestUnlock from '@/components/today/GuestUnlock';

/**
 * Lista dzisiejszych typów modelu na stronie „Typy na dziś".
 *
 * Serwer renderuje wersję dla wszystkich (mecze, godziny, ligi — typy za kłódką, poza typem
 * dnia), bo to ją widzi robot wyszukiwarki. Po załadowaniu pytamy o plakietki tą samą trasą co
 * lista meczów: kto ma plan z liczbami (Pro, VIP, okres próbny), dostaje je tu bez przeładowania.
 *
 * Wiersz prowadzi na stronę „typ na mecz" (indeksowaną), a stamtąd jest przejście do pokoju
 * meczowego — dzięki temu robot trafia na strony meczów z tej, którą już zna.
 *
 * Pod zamkniętą listą jedno wezwanie: gość — rejestracja (okres próbny odkrywa typy), zalogowany —
 * cennik, ale dopiero gdy plakietki wróciły nadal zamknięte (plan z liczbami nie zobaczy „Odblokuj").
 */
export default function TodayPicksList({ items, date, locale, labels: c }) {
	const [lista, setLista] = useState(items);
	// Czy plakietki z sesją już wróciły — dopiero wtedy wiadomo, że zalogowany naprawdę nie ma planu.
	const [doczytane, setDoczytane] = useState(false);
	const authKey = useAuthKey();

	useEffect(() => {
		if (!authKey) return undefined;
		let anulowane = false;
		fetch(`/api/football/model-hints?date=${date}`, { credentials: 'include', cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (anulowane || !d?.hints) return;
				setLista((prev) => prev.map((p) => ({ ...p, hint: d.hints[p.fixtureId] ?? p.hint })));
				setDoczytane(true);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, [date, authKey]);

	if (!lista.length) return <p className="mt-3 text-sm text-muted">{c.listEmpty}</p>;
	const zamkniete = lista.some((p) => !p.hint || p.hint.locked);

	return (
		<>
			<ul className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface">
				{lista.map((p) => {
					const odkryty = p.hint && !p.hint.locked;
					const godzina = new Date(p.kickoff).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', {
						timeZone: 'Europe/Warsaw',
						hour: '2-digit',
						minute: '2-digit',
					});
					return (
						<li key={p.fixtureId}>
							<Link
								href={matchPath({ fixtureId: p.fixtureId, homeName: p.home, awayName: p.away })}
								className="group flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-2"
							>
								<span className="w-11 shrink-0 text-sm font-bold tabular-nums text-text">{godzina}</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-bold text-text">
										{p.home} – {p.away}
									</span>
									<span className="block truncate text-xs text-muted">{p.league}</span>
								</span>
								{odkryty ? (
									<span className="shrink-0 text-right">
										<span className="flex items-center justify-end gap-1 text-sm font-semibold text-accent">
											<Sparkles size={12} aria-hidden="true" />
											{p.hint.selection}
										</span>
										<span className="block text-xs tabular-nums text-muted">
											{p.hint.probability}% ({c.usually} {Math.round(p.hint.base)}%)
										</span>
									</span>
								) : (
									<span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 py-1 text-xs text-muted">
										<Sparkles size={12} aria-hidden="true" />
										<Lock size={11} aria-hidden="true" />
									</span>
								)}
								<ChevronRight size={16} aria-hidden="true" className="shrink-0 text-border-strong group-hover:text-accent" />
							</Link>
						</li>
					);
				})}
			</ul>
			{zamkniete && (
				<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
					{c.listUnlockGuest && (
						<GuestUnlock label={c.listUnlockGuest}>
							{doczytane && c.unlock ? (
								<Link
									href="/cennik"
									className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
								>
									<Lock size={14} aria-hidden="true" />
									{c.unlock}
									<ArrowRight size={15} aria-hidden="true" />
								</Link>
							) : null}
						</GuestUnlock>
					)}
					<p className="text-xs leading-relaxed text-muted">{c.listLocked}</p>
				</div>
			)}
		</>
	);
}
