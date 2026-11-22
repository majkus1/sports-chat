import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import AppShell from '@/components/layout/AppShell';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo/metadata';
import { MODEL_VERSION } from '@/lib/model';
import { shotsConfig } from '@/lib/model/shotStrength';
import { calibrationHistory, currentCalibration, rollbackCalibration } from '@/lib/model/chanceCalibrationStore';
import { weeklyReportHistory } from '@/lib/model/weeklyJob';

/**
 * Model — strona tylko dla administratora: obowiązująca korekta szansy, historia jej wersji
 * z przyciskiem wycofania i cotygodniowe raporty (`lib/model/weeklyJob.js`) w tej samej treści,
 * która przyszła mailem. Dla każdego innego konta (i gościa) strona nie istnieje (404).
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
	const { locale } = await params;
	return buildMetadata({ locale, path: '/admin/model', title: 'Model', noindex: true });
}

async function czyAdmin() {
	const session = await getAuthenticatedUser();
	if (!session) return false;
	await connectToDb();
	const user = await User.findById(session.userId).select('role').lean();
	return user?.role === 'admin';
}

/**
 * Wycofanie aktywnej wersji korekty — wraca poprzednia (albo plik danych z repozytorium).
 * Akcja serwerowa sprawdza rolę sama: formularz da się wysłać spoza tej strony.
 */
async function wycofajKorekte() {
	'use server';
	if (!(await czyAdmin())) return;
	const wynik = await rollbackCalibration();
	console.log('[calibration] wycofanie z panelu:', JSON.stringify(wynik));
	revalidatePath('/[locale]/admin/model', 'page');
}

const data = (d) =>
	d ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(d)) : '—';

const STATUS = { active: 'aktywna', superseded: 'zastąpiona', rolled_back: 'wycofana' };

export default async function Page() {
	if (!(await czyAdmin())) notFound();

	const [obecna, wersje, raporty] = await Promise.all([
		currentCalibration().catch(() => null),
		calibrationHistory().catch(() => []),
		weeklyReportHistory().catch(() => []),
	]);
	const strzaly = shotsConfig();
	const korekty = Object.entries(obecna?.selections || {}).filter(([, w]) => w?.enabled);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">Model</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				Wersja <strong className="text-text">{MODEL_VERSION}</strong>
				{strzaly.enabled ? `, siła drużyn z ${strzaly.a}·gole + ${(1 - strzaly.a).toFixed(1)}·strzały celne` : ', strzały wyłączone (MODEL_SHOTS=off)'}. Raport przychodzi
				mailem w poniedziałek o 6:30.
			</p>

			<section className="mt-8 rounded-[var(--radius-ui)] border border-border bg-surface p-5">
				<h2 className="font-display text-lg font-bold uppercase tracking-wide text-text">Korekta szansy</h2>
				<p className="mt-2 text-sm text-muted">
					Obowiązuje: <strong className="text-text">{obecna?.version ?? '—'}</strong> ({obecna?.source === 'db' ? `z bazy, od ${data(obecna.activatedAt)}` : 'plik z repozytorium'}).
				</p>
				<p className="mt-1 text-sm text-muted">
					{korekty.length
						? `Korekta włączona: ${korekty.map(([k, w]) => `${k} (${w.shift})`).join(', ')}.`
						: 'Żadna selekcja nie ma korekty — pokazujemy szansę modelu bez zmian.'}
				</p>
				{obecna?.source === 'db' && (
					<form action={wycofajKorekte} className="mt-4">
						<button
							type="submit"
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-accent hover:bg-accent-soft"
						>
							Wycofaj do poprzedniej wersji
						</button>
					</form>
				)}
				{wersje.length > 0 && (
					<ul className="mt-4 space-y-1 text-sm text-muted">
						{wersje.map((w) => (
							<li key={String(w._id)}>
								{data(w.activatedAt)} — {w.version} — {STATUS[w.status] ?? w.status}
								{w.previousVersion ? ` (poprzednia: ${w.previousVersion})` : ''}
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="mt-10">
				<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">Raporty tygodniowe</h2>
				{!raporty.length && <p className="mt-3 text-sm text-muted">Jeszcze nie ma raportu — pierwszy powstanie w najbliższy poniedziałek.</p>}
				{raporty.map((r) => (
					<details key={String(r._id)} className="mt-4 rounded-[var(--radius-ui)] border border-border bg-surface p-4">
						<summary className="cursor-pointer text-sm font-semibold text-text">
							{data(r.at)} — {r.subject}
							{r.calibration?.activated ? ` — włączono ${r.calibration.activated}` : ''}
						</summary>
						<pre className="mt-3 whitespace-pre-wrap font-[inherit] text-[13px] leading-relaxed text-text">{r.text}</pre>
						{r.problems?.length > 0 && <p className="mt-2 text-xs text-loss">Problemy: {r.problems.join('; ')}</p>}
						<p className="mt-2 text-xs text-muted">Mail do {r.emailedTo ?? 0} administratorów.</p>
					</details>
				))}
			</section>
		</AppShell>
	);
}
