import { notFound } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo/metadata';
import { upsellSummary } from '@/lib/upsell/stats';

/**
 * Okna zakupu: które miejsce działa — strona tylko dla administratora (dla innych 404, bez indeksu).
 *
 * Cztery liczby na miejsce, z ostatnich 14 dni: wyświetlenia (karta była na ekranie), kliknięcia,
 * rozpoczęte płatności (powstała sesja Stripe'a) i zakupy (opłacone, z webhooka). Odsetki liczone
 * z sum, nie średnią dzienną. Pod spodem dni, żeby było widać, czy coś się zmieniło po zmianie tekstu.
 *
 * Przy dziesięciu kontach z zewnątrz liczby będą małe przez tygodnie — strona mówi to wprost,
 * żeby nikt nie wyciągał wniosków z trzech kliknięć.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/admin/okna-zakupu', title: 'Okna zakupu', noindex: true });
}

const proc = (v) => (v === null ? '—' : `${v.toLocaleString('pl-PL')}%`);

export default async function Page() {
	const session = await getAuthenticatedUser();
	if (!session) notFound();
	await connectToDb();
	const user = await User.findById(session.userId).select('role').lean();
	if (user?.role !== 'admin') notFound();

	const s = await upsellSummary({ days: 14 }).catch(() => null);
	const suma = (s?.placements || []).reduce(
		(a, p) => ({ views: a.views + p.views, clicks: a.clicks + p.clicks, checkouts: a.checkouts + p.checkouts, purchases: a.purchases + p.purchases }),
		{ views: 0, clicks: 0, checkouts: 0, purchases: 0 }
	);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-4xl">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">Okna zakupu</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				Ostatnie 14 dni{s ? ` (${s.from} – ${s.to})` : ''}. Wyświetlenie liczy się, gdy propozycja była na ekranie;
				płatność — gdy powstała sesja Stripe&apos;a; zakup — gdy webhook potwierdził zapłatę. Same sumy, bez kont i adresów.
				{suma.clicks < 30 && ' Próba jest jeszcze mała — kilka kliknięć to za mało na wnioski.'}
			</p>

			{!s ? (
				<p className="mt-6 rounded-[var(--radius-ui)] border border-border bg-surface p-5 text-sm text-muted">
					Nie udało się odczytać licznika. Spróbuj za chwilę.
				</p>
			) : (
				<>
					<div className="mt-6 overflow-x-auto rounded-[var(--radius-ui)] border border-border bg-surface">
						<table className="w-full min-w-[640px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
									<th className="px-4 py-2.5 font-semibold">Miejsce</th>
									<th className="px-3 py-2.5 text-right font-semibold">Wyśw.</th>
									<th className="px-3 py-2.5 text-right font-semibold">Klik.</th>
									<th className="px-3 py-2.5 text-right font-semibold">CTR</th>
									<th className="px-3 py-2.5 text-right font-semibold">Płatn.</th>
									<th className="px-3 py-2.5 text-right font-semibold">Zakupy</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{s.placements.map((p) => (
									<tr key={p.placement}>
										<td className="px-4 py-2.5 text-text">
											{p.label}
											<span className="ml-2 font-mono text-[11px] text-muted">{p.placement}</span>
										</td>
										<td className="px-3 py-2.5 text-right tabular-nums">{p.views}</td>
										<td className="px-3 py-2.5 text-right tabular-nums">{p.clicks}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-muted">{proc(p.ctr)}</td>
										<td className="px-3 py-2.5 text-right tabular-nums">{p.checkouts}</td>
										<td className="px-3 py-2.5 text-right font-semibold tabular-nums text-accent">{p.purchases}</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr className="border-t border-border font-semibold">
									<td className="px-4 py-2.5">Razem</td>
									<td className="px-3 py-2.5 text-right tabular-nums">{suma.views}</td>
									<td className="px-3 py-2.5 text-right tabular-nums">{suma.clicks}</td>
									<td className="px-3 py-2.5 text-right tabular-nums text-muted">
										{proc(suma.views ? Math.round((1000 * suma.clicks) / suma.views) / 10 : null)}
									</td>
									<td className="px-3 py-2.5 text-right tabular-nums">{suma.checkouts}</td>
									<td className="px-3 py-2.5 text-right tabular-nums text-accent">{suma.purchases}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<h2 className="mt-8 font-display text-lg font-bold uppercase tracking-wide text-text">Dzień po dniu</h2>
					{s.rows.length === 0 ? (
						<p className="mt-3 text-sm text-muted">Jeszcze nic nie zapisano.</p>
					) : (
						<ul className="mt-3 divide-y divide-border rounded-[var(--radius-ui)] border border-border bg-surface text-sm">
							{s.rows.map((r) => (
								<li key={`${r.day}:${r.placement}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2">
									<span className="w-24 shrink-0 tabular-nums text-muted">{r.day}</span>
									<span className="min-w-0 flex-1 truncate text-text">{r.placement}</span>
									<span className="tabular-nums text-muted">
										{r.views || 0} / {r.clicks || 0} / {r.checkouts || 0} / <strong className="text-accent">{r.purchases || 0}</strong>
									</span>
								</li>
							))}
						</ul>
					)}
					<p className="mt-2 text-xs text-muted">Kolejno: wyświetlenia / kliknięcia / płatności / zakupy.</p>
				</>
			)}
		</AppShell>
	);
}
