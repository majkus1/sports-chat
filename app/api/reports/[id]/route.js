import mongoose from 'mongoose';
import connectToDb from '@/lib/db';
import Report from '@/models/Report';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * Szczegół i usunięcie pojedynczego raportu.
 *
 * Właściciel jest częścią zapytania (`userId` w filtrze), nie osobnym sprawdzeniem —
 * cudzy identyfikator daje 404 nieodróżnialne od nieistniejącego, więc nie zdradza,
 * czy raport w ogóle istnieje.
 */

async function ownReportFilter(params) {
	const session = await getAuthenticatedUser();
	if (!session) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) };

	const { id } = await params;
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return { error: Response.json({ error: 'not_found' }, { status: 404 }) };
	}

	await connectToDb();
	return { filter: { _id: id, userId: session.userId } };
}

export async function GET(request, { params }) {
	const { filter, error } = await ownReportFilter(params);
	if (error) return error;

	const report = await Report.findOne(filter).lean();
	if (!report) return Response.json({ error: 'not_found' }, { status: 404 });

	return Response.json({
		id: String(report._id),
		type: report.type,
		language: report.language,
		status: report.status,
		sections: report.sections,
		fixtureCount: report.fixtureCount,
		candidateCount: report.candidateCount,
		createdAt: report.createdAt,
	});
}

export async function DELETE(request, { params }) {
	const { filter, error } = await ownReportFilter(params);
	if (error) return error;

	const result = await Report.deleteOne(filter);
	if (!result.deletedCount) return Response.json({ error: 'not_found' }, { status: 404 });

	return Response.json({ ok: true });
}
