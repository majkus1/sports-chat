import connectToDb from '@/lib/db';
import Report from '@/models/Report';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * Lista raportów zalogowanego użytkownika — sekcja „Moje raporty".
 *
 * Sama metryka, bez treści: lista bywa długa, a `sections` z kilkunastoma typami
 * to kilkadziesiąt kilobajtów na rekord. Treść pobiera się osobno po identyfikatorze.
 */
export async function GET() {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	await connectToDb();
	const reports = await Report.find({ userId: session.userId })
		.select('type language status fixtureCount candidateCount createdAt')
		.sort({ createdAt: -1 })
		.limit(50)
		.lean();

	return Response.json({
		reports: reports.map((r) => ({
			id: String(r._id),
			type: r.type,
			language: r.language,
			status: r.status,
			fixtureCount: r.fixtureCount,
			candidateCount: r.candidateCount,
			createdAt: r.createdAt,
		})),
	});
}
