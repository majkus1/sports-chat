import mongoose from 'mongoose';
import CouponGenAttempt from '@/models/CouponGenAttempt';

/**
 * Dziennik nieudanych złożeń kreatora kuponu (`models/CouponGenAttempt.js`) i zestawienie do panelu
 * administratora (`/admin/kreator`).
 *
 * Zapis NIGDY nie psuje odpowiedzi: błąd bazy przy dzienniku to utracony pomiar, a użytkownik i tak
 * dostaje powód i propozycje. Stąd `try/catch` z ostrzeżeniem w logu i `null` zamiast identyfikatora.
 */

/** Postać ustawień do zapisu — dokładnie pola kreatora, nic więcej. */
const ustawienia = (p) => ({
	odds: p.odds,
	legs: p.legs,
	window: p.window,
	leagues: [...(p.leagues || [])],
	skipPublished: Boolean(p.skipPublished),
});

const poprawneId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;

/**
 * Zapisuje nieudaną próbę.
 *
 * @param {{ userId: string, quota: object, params: object, result: { reason: string, counts?: object, dropped?: Array,
 *   partial?: boolean }, alternatives: Array, fromAttempt?: string|null, now?: Date }} input
 * @returns {Promise<string|null>} identyfikator wpisu (do przyjęcia propozycji) albo `null` przy błędzie
 */
export async function logAttempt({ userId, quota, params, result, alternatives = [], fromAttempt = null, now = new Date() }) {
	try {
		const doc = await CouponGenAttempt.create({
			userId,
			plan: quota?.plan ?? null,
			inTrial: Boolean(quota?.inTrial),
			params: ustawienia(params),
			reason: result.reason,
			counts: result.counts || null,
			dropped: result.dropped?.length || 0,
			partial: Boolean(result.partial),
			alternatives: alternatives.map((a) => ({
				params: ustawienia(a.params),
				changes: a.changes.map((c) => c.field),
				totalOdds: a.preview?.totalOdds ?? null,
				chance: a.preview?.chance ?? null,
				legs: a.preview?.legs?.length ?? null,
			})),
			fromAttempt: poprawneId(fromAttempt) ? fromAttempt : null,
			createdAt: now,
		});
		return String(doc._id);
	} catch (error) {
		console.warn('[coupons] dziennik prób kreatora — zapis nie powiódł się:', error.message);
		return null;
	}
}

/**
 * Oznacza przyjęcie propozycji — tylko we wpisie TEGO użytkownika i tylko pierwsze (drugie kliknięcie
 * tej samej karty albo innej propozycji z tej samej próby nie nadpisuje wyniku pierwszego).
 *
 * @returns {Promise<boolean>} czy coś oznaczono
 */
export async function markAccepted({ attemptId, userId, index, outcome, now = new Date() }) {
	if (!poprawneId(attemptId) || !Number.isInteger(index) || index < 0) return false;
	try {
		const r = await CouponGenAttempt.updateOne(
			{ _id: attemptId, userId, accepted: null, [`alternatives.${index}`]: { $exists: true } },
			{ $set: { accepted: { index, at: now, outcome } } }
		);
		return r.modifiedCount === 1;
	} catch (error) {
		console.warn('[coupons] dziennik prób kreatora — przyjęcie nie zapisane:', error.message);
		return false;
	}
}

/**
 * Zestawienie wpisów (część czysta): najczęstsze powody, ile prób dostało propozycje, jak często
 * propozycję przyjęto i czy z niej powstał kupon, które zmiany przyjmowano, z jakich planów.
 *
 * @param {Array} rows wpisy dziennika (`reason`, `alternatives`, `accepted`, `plan`, `inTrial`, `fromAttempt`)
 */
export function summarizeAttempts(rows) {
	const lista = rows || [];
	const total = lista.length;
	const procent = (a, b) => (b ? Math.round((100 * a) / b) : null);
	const policz = (klucze) => {
		const m = new Map();
		for (const k of klucze) m.set(k, (m.get(k) || 0) + 1);
		return [...m.entries()].map(([key, count]) => ({ key, count, share: procent(count, total) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
	};
	const zPropozycjami = lista.filter((r) => r.alternatives?.length);
	const przyjete = zPropozycjami.filter((r) => r.accepted);
	const udane = przyjete.filter((r) => r.accepted.outcome === 'ok');
	const zmianyPrzyjete = przyjete.flatMap((r) => r.alternatives[r.accepted.index]?.changes || []);
	return {
		total,
		users: new Set(lista.map((r) => String(r.userId))).size,
		reasons: policz(lista.map((r) => r.reason)),
		withAlternatives: zPropozycjami.length,
		withAlternativesRate: procent(zPropozycjami.length, total),
		accepted: przyjete.length,
		acceptRate: procent(przyjete.length, zPropozycjami.length),
		acceptedOk: udane.length,
		acceptedOkRate: procent(udane.length, przyjete.length),
		acceptedChanges: policz(zmianyPrzyjete).map(({ key, count }) => ({ key, count })),
		acceptedPosition: [0, 1, 2].map((i) => przyjete.filter((r) => r.accepted.index === i).length),
		plans: policz(lista.map((r) => (r.inTrial ? 'trial' : r.plan || '—'))),
		followUps: lista.filter((r) => r.fromAttempt).length,
	};
}

/** Najwyżej tyle wpisów do zestawienia — przy kilkuset próbach dziennie to i tak kilka tygodni. */
const MAX_WIERSZY = 20_000;

/** Zestawienie z ostatnich `days` dni (panel administratora). */
export async function attemptStats({ days = 30, now = new Date() } = {}) {
	const od = new Date(now.getTime() - days * 24 * 3600_000);
	const rows = await CouponGenAttempt.find({ createdAt: { $gte: od, $lte: now } })
		.select('userId reason alternatives.changes accepted plan inTrial fromAttempt')
		.sort({ createdAt: -1 })
		.limit(MAX_WIERSZY)
		.lean();
	return { days, from: od, ...summarizeAttempts(rows) };
}
