import User from '@/models/User';
import { TERMS_VERSION } from '@/lib/legal/operator';

/**
 * Logowanie i rejestracja przez Google — część PO weryfikacji tokenu, bez sieci.
 *
 * Osobno od trasy, żeby dało się ją sprawdzić na bazie bez prawdziwego tokenu Google.
 * Trasa (`app/api/auth/google`) weryfikuje podpis tokenu i przekazuje tu jego treść.
 *
 * TRZY REGUŁY, KAŻDA Z KONKRETNEGO POWODU:
 *
 * 1. NOWE KONTO TYLKO ZE ZGODĄ NA REGULAMIN. Przycisk Google stoi także w oknie LOGOWANIA,
 *    gdzie nie ma pola z regulaminem. Nowa osoba klikała tam „Kontynuuj z Google" i dostawała
 *    konto z wpisem „regulamin zaakceptowany", którego nikt nie zaznaczył. Teraz bez
 *    `acceptedTerms` nowe konto nie powstaje — interfejs przenosi do okna rejestracji.
 *
 * 2. BEZ PRZEJĘCIA KONTA. Ktoś mógł założyć konto hasłem na cudzy adres (nie potwierdzając go),
 *    a gdy właściciel adresu zalogował się potem przez Google, konta się łączyły, adres
 *    stawał się potwierdzony — a hasło znał napastnik. Przy łączeniu z kontem, którego adresu
 *    nikt nie potwierdził, hasło jest kasowane, a wszystkie sesje unieważniane: konto należy
 *    odtąd do tego, kto udowodnił adres przez Google.
 *
 * 3. JEDNO KONTO GOOGLE NA KONTO. Adres zgadza się, ale konto jest już połączone z INNYM kontem
 *    Google — nie łączymy po cichu, zwracamy konflikt.
 *
 * @param {{ sub: string, email: string, email_verified?: boolean, name?: string, picture?: string }} p
 *   treść zweryfikowanego tokenu
 * @param {{ acceptedTerms?: boolean }} [options] `acceptedTerms` — zaznaczona zgoda w oknie rejestracji
 * @returns {Promise<{ user: object, created: boolean } | { error: string }>}
 */
export async function googleSignIn(p, { acceptedTerms = false } = {}) {
	if (!p?.email || !p?.sub) return { error: 'google_invalid_token' };
	if (p.email_verified === false) return { error: 'google_email_not_verified' };

	const email = p.email.toLowerCase();
	let user = await User.findOne({ googleId: p.sub });
	if (!user) user = await User.findOne({ email });

	if (!user) {
		if (acceptedTerms !== true) return { error: 'google_terms_required' };

		// Nazwa konta ma co najmniej 3 znaki (schemat) — imię „Jo" z Google wywracało zakładanie.
		const zImienia = (p.name || email.split('@')[0]).replace(/\s+/g, '').slice(0, 20);
		const base = zImienia.length >= 3 ? zImienia : `user${p.sub.slice(-6)}`;
		let candidate = base;
		for (let i = 1; await User.exists({ username: candidate }); i += 1) {
			candidate = `${base}${i}`;
		}

		user = await User.create({
			email,
			username: candidate,
			password: null,
			googleId: p.sub,
			image: p.picture || null,
			isEmailVerified: true,
			termsAcceptedAt: new Date(),
			termsVersion: TERMS_VERSION,
		});
		return { user, created: true };
	}

	if (user.googleId && user.googleId !== p.sub) return { error: 'google_account_conflict' };

	const update = {};
	if (!user.googleId) {
		update.googleId = p.sub;
		if (!user.isEmailVerified) {
			// Reguła 2: adres nigdy niepotwierdzony — hasło mógł ustawić ktoś obcy.
			update.password = null;
			update.tokenVersion = (user.tokenVersion || 0) + 1;
			update.refreshTokenHash = null;
		}
	}
	if (!user.image && p.picture) update.image = p.picture;
	if (!user.isEmailVerified) update.isEmailVerified = true;
	if (Object.keys(update).length) {
		await User.updateOne({ _id: user._id }, { $set: update });
		user = await User.findById(user._id);
	}
	return { user, created: false };
}
