import connectToDb from '@/lib/db';
import MatchAnalysis from '@/models/MatchAnalysis';
import User from '@/models/User';
import { checkQuota, checkAnalysisView } from '@/lib/billing/entitlements';
import { getClientIp } from '@/lib/requestIp';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * Sprawdzenie przed generowaniem: czy analiza już jest i czy użytkownikowi wolno ją zrobić.
 *
 * Limit pochodzi z planu konta, nie z liczby zaszytej w tym pliku — dzięki temu jedna
 * zmiana w `lib/billing/plans.js` obowiązuje we wszystkich trasach naraz.
 */
export async function POST(request) {
	try {
		const body = await request.json();
		const { fixtureId, language, isLive } = body || {};

		if (!fixtureId) {
			return Response.json({ error: 'Missing fixtureId in request body' }, { status: 400 });
		}

		const headerLang =
			request.headers.get('x-lang') || request.headers.get('accept-language') || '';
		const detected = (language || String(headerLang)).toLowerCase();
		const lang2 = detected.startsWith('en') ? 'en' : 'pl';

		await connectToDb();

		const ip = getClientIp(request);

		/*
		 * Tożsamość ustalamy tak samo jak pozostałe trasy.
		 *
		 * Ręczne `verifyJwt` sprawdzało wyłącznie podpis i pomijało `tokenVersion`, czyli
		 * mechanizm unieważniania sesji podbijany przy resecie hasła. Token wykradziony
		 * przed resetem działałby tu dalej, mimo że wszędzie indziej był już odrzucany.
		 */
		const session = await getAuthenticatedUser();
		const userId = session?.userId || null;

		const user = userId
			? await User.findById(userId).select('plan planStatus planValidUntil role credits createdAt').lean()
			: null;

		// Mecze na żywo pomijają cache — zapisana analiza opisuje minutę, która już minęła.
		if (!isLive) {
			const existing = await MatchAnalysis.findOne({ fixtureId, language: lang2 })
				.populate('generatedBy', 'username')
				.lean();
			const isFresh = existing && (!existing.expiresAt || existing.expiresAt > new Date());

			if (isFresh) {
				const isOwn = Boolean(
					userId && existing.generatedBy && String(existing.generatedBy._id) === String(userId)
				);

				/*
				 * Czytanie cudzej analizy ma swój dzienny limit. Bez tego wystarczyłoby, że
				 * jedna osoba wygeneruje analizę popularnego meczu, a plan przestawałby mieć
				 * znaczenie dla wszystkich pozostałych.
				 */
				const view = await checkAnalysisView({ user, userId, ip, fixtureId, isOwn });

				if (!view.allowed) {
					return Response.json(
						{
							exists: true,
							viewLimitExceeded: true,
							viewLimit: view.limit,
							viewUsed: view.used,
							plan: view.plan,
							isLoggedIn: Boolean(userId),
							canGenerate: false,
						},
						{ status: 200 }
					);
				}

				return Response.json(
					{
						exists: true,
						analysis: existing.analysis,
						// Ustrukturyzowany wynik; null dla rekordów sprzed wprowadzenia sekcji.
						sections: existing.sections || null,
						canGenerate: true,
						// Autorstwo i data — analiza bywa cudza i sprzed kilku godzin.
						generatedAt: existing.updatedAt || existing.createdAt || null,
						generatedByName: existing.generatedBy?.username || null,
						isOwn,
						viewUsed: view.used,
						viewLimit: view.limit,
					},
					{ status: 200 }
				);
			}
		}

		const quota = await checkQuota({ kind: 'analysis', user, userId, ip });

		return Response.json(
			{
				exists: false,
				canGenerate: quota.allowed,
				limitExceeded: !quota.allowed,
				currentLimit: quota.used,
				maxLimit: quota.limit,
				plan: quota.plan,
				isLoggedIn: Boolean(userId),
			},
			{ status: 200 }
		);
	} catch (error) {
		if (process.env.NODE_ENV === 'development') {
			console.error('Error checking analysis:', error);
		}
		// Przy błędzie odmawiamy generowania — tańsza pomyłka niż niekontrolowane wywołania.
		return Response.json(
			{
				error: 'Failed to check analysis',
				exists: false,
				canGenerate: false,
				limitExceeded: true,
				isLoggedIn: false,
			},
			{ status: 500 }
		);
	}
}
