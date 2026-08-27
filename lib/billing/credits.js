import CreditLedger from '@/models/CreditLedger';
import User from '@/models/User';

/**
 * Operacje na kredytach: dopisanie po opłaconym zakupie i ślad w księdze.
 *
 * Kolejność w `grantCredits` nie jest przypadkowa — najpierw wpis do księgi, potem zmiana
 * salda. Odwrotnie wyglądałoby to tak: dopisujemy kredyty, po czym zapis księgi pada,
 * Stripe ponawia zdarzenie i dopisujemy je drugi raz. Przy tej kolejności powtórka wywala
 * się na unikalnym indeksie ZANIM ktokolwiek dostanie cokolwiek za darmo.
 */

/**
 * Dopisuje wpis do księgi. Duplikat nie jest błędem — to oczekiwany skutek ponowienia.
 *
 * @returns {Promise<boolean>} `true`, jeżeli to pierwsze wystąpienie tego zdarzenia
 */
export async function recordCreditChange({ userId, amount, reason, idempotencyKey, details = {} }) {
	try {
		await CreditLedger.create({ userId, amount, reason, idempotencyKey, details });
		return true;
	} catch (error) {
		// 11000 = naruszenie unikalnego indeksu, czyli zdarzenie już rozliczone.
		if (error?.code === 11000) return false;
		throw error;
	}
}

/**
 * Nalicza kredyty po potwierdzonej płatności.
 *
 * @returns {Promise<{granted: boolean, credits: number|null}>} `granted:false` przy powtórce
 */
export async function grantCredits({ userId, credits, reason, idempotencyKey, details = {} }) {
	if (!userId || !Number.isInteger(credits) || credits <= 0) {
		throw new Error('grantCredits: wymagane userId i dodatnia całkowita liczba kredytów');
	}

	const first = await recordCreditChange({ userId, amount: credits, reason, idempotencyKey, details });
	if (!first) return { granted: false, credits: null };

	const user = await User.findByIdAndUpdate(
		userId,
		{ $inc: { credits } },
		{ new: true, select: 'credits' }
	);

	return { granted: true, credits: user?.credits ?? null };
}

/**
 * Odejmuje kredyty przy zwrocie płatności.
 *
 * Saldo może zejść poniżej zera i tak ma być: użytkownik zdążył wydać kredyty, po czym
 * odzyskał pieniądze. Ujemne saldo blokuje kolejne operacje na kredyty i jest widoczne
 * w księdze, więc da się je wyjaśnić — wyzerowanie ukryłoby, że coś zostało wydane.
 */
export async function revokeCredits({ userId, credits, reason, idempotencyKey, details = {} }) {
	const first = await recordCreditChange({
		userId,
		amount: -credits,
		reason,
		idempotencyKey,
		details,
	});
	if (!first) return { revoked: false };

	await User.updateOne({ _id: userId }, { $inc: { credits: -credits } });
	return { revoked: true };
}

/** Historia kredytów konta, od najnowszych. */
export async function creditHistory(userId, limit = 30) {
	return CreditLedger.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}
