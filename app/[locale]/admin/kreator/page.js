import { notFound } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { attemptStats } from '@/lib/coupons/attempts';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Kreator kuponu — nieudane próby i propozycje (`lib/coupons/attempts.js`). Tylko dla administratora;
 * dla każdego innego konta strona nie istnieje (404), wyszukiwarka jej nie indeksuje.
 *
 * Dwa pytania, na które ma odpowiadać jednym spojrzeniem: DLACZEGO kupon najczęściej nie powstaje
 * (wtedy wiadomo, czy poprawiać pulę, okna, czy opis) i CZY propozycje pomagają — jak często ktoś
 * przyjmuje propozycję i czy z niej faktycznie wychodzi kupon. `?dni=7|30|90` — zakres (domyślnie 30).
 */

export const dynamic = 'force-dynamic';

const ZAKRESY = [7, 30, 90];

const POWODY = {
	too_few_legs: 'Za mało meczów na ten kurs',
	window_closed: 'Okno godzin już puste',
	unavailable: 'Dane nie przyszły (plakietki albo kursy)',
	no_matches: 'Brak meczów z typem w godzinach i ligach',
	leagues_empty: 'Wybrane ligi bez meczów z typem',
	few_picks: 'Za mało typów spełniających zasady',
	no_combo: 'Typy są, ale żaden zestaw nie mieści się w widełkach',
	news_dropped: 'Wiadomości odrzuciły typy, zabrakło zastępstwa',
};
const ZMIANY = {
	window: 'Godziny',
	legs: 'Liczba meczów',
	odds: 'Niższy kurs',
	leagues: 'Wszystkie ligi',
	skipPublished: 'Mecze z kuponów serwisu',
};
const PLANY = { trial: 'Okres próbny', pro: 'Pro', vip: 'VIP', free: 'Darmowy', admin: 'Administrator' };

export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/admin/kreator', title: 'Kreator — nieudane próby', noindex: true });
}

const proc = (v) => (v === null || v === undefined ? '—' : `${v}%`);

function Kafel({ label, value, note }) {
	return (
		<div className="rounded-[var(--radius-ui)] border border-border bg-surface p-4">
			<p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
			<p className="mt-1 font-display text-2xl font-bold tabular-nums text-text">{value}</p>
			{note && <p className="mt-1 text-xs text-muted">{note}</p>}
		</div>
	);
}

function Paski({ tytul, wiersze, nazwy, razem }) {
	return (
		<section className="mt-8">
			<h2 className="font-display text-lg font-bold uppercase tracking-wide text-text">{tytul}</h2>
			{wiersze.length ? (
				<ul className="mt-3 flex flex-col gap-2.5">
					{wiersze.map((w) => {
						const udzial = razem ? Math.round((100 * w.count) / razem) : 0;
						return (
							<li key={w.key}>
								<div className="flex items-baseline justify-between gap-3 text-sm">
									<span className="min-w-0 text-text">{nazwy[w.key] || w.key}</span>
									<span className="shrink-0 tabular-nums text-muted">
										{w.count} · {udzial}%
									</span>
								</div>
								<div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
									<div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, udzial)}%` }} />
								</div>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="mt-3 text-sm text-muted">Brak danych w tym zakresie.</p>
			)}
		</section>
	);
}

export default async function Page({ searchParams }) {
	const session = await getAuthenticatedUser();
	if (!session) notFound();
	await connectToDb();
	const user = await User.findById(session.userId).select('role').lean();
	if (user?.role !== 'admin') notFound();

	const sp = (await searchParams) || {};
	const dni = ZAKRESY.includes(Number(sp.dni)) ? Number(sp.dni) : 30;
	const s = await attemptStats({ days: dni });
	const sumaZmian = s.acceptedChanges.reduce((a, w) => a + w.count, 0);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-2xl">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">Kreator — nieudane próby</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				Złożenia, z których kupon nie powstał, z ostatnich {dni} dni: powód, czy kreator miał propozycję i czy ktoś ją
				przyjął. Wpisy kasują się same po 180 dniach.
			</p>
			<nav aria-label="Zakres" className="mt-4 flex gap-2">
				{ZAKRESY.map((z) => (
					<a
						key={z}
						href={`?dni=${z}`}
						aria-current={z === dni ? 'page' : undefined}
						className={`rounded-full border px-3 py-1.5 text-sm font-semibold no-underline ${
							z === dni ? 'border-accent bg-accent text-accent-fg' : 'border-border text-text hover:border-accent'
						}`}
					>
						{z} dni
					</a>
				))}
			</nav>

			<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Kafel label="Nieudane próby" value={s.total} note={`${s.users} kont`} />
				<Kafel label="Z propozycją" value={proc(s.withAlternativesRate)} note={`${s.withAlternatives} prób`} />
				<Kafel label="Przyjęte" value={proc(s.acceptRate)} note={`${s.accepted} z ${s.withAlternatives}`} />
				<Kafel label="Kupon z propozycji" value={proc(s.acceptedOkRate)} note={`${s.acceptedOk} z ${s.accepted}`} />
			</div>

			<Paski tytul="Najczęstsze przyczyny" wiersze={s.reasons} nazwy={POWODY} razem={s.total} />
			<Paski tytul="Jaką zmianę przyjmowano" wiersze={s.acceptedChanges} nazwy={ZMIANY} razem={sumaZmian} />
			<Paski tytul="Plany" wiersze={s.plans} nazwy={PLANY} razem={s.total} />

			<p className="mt-8 text-xs leading-relaxed text-muted">
				Przyjęta propozycja według pozycji na karcie: 1. — {s.acceptedPosition[0]}, 2. — {s.acceptedPosition[1]}, 3. —{' '}
				{s.acceptedPosition[2]}. Ponowne „nie da się” po przyjęciu: {s.followUps}. „Kupon z propozycji” liczy złożenia z
				przyjętej propozycji, które zakończyły się kuponem (wiadomości mogą jeszcze odrzucić typ z zapowiedzi).
			</p>
		</AppShell>
	);
}
