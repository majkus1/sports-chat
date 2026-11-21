import connectToDb from '@/lib/db';
import User from '@/models/User';
import PurchaseConsent from '@/models/PurchaseConsent';
import { getAuthenticatedUser } from '@/lib/auth';
import { getCreditPack, getPlanPass } from '@/lib/billing/plans';
import { canBuyPass } from '@/lib/billing/planAccess';
import { checkoutSessionParams } from '@/lib/billing/checkoutSession';
import { CONSENT_VERSION, consentFor } from '@/lib/legal/purchaseConsent';
import { getClientIp } from '@/lib/requestIp';
import { getStripe, getStripeConfig } from '@/lib/stripe/config';
import { isPlacement } from '@/lib/upsell/placements';
import { recordUpsell } from '@/lib/upsell/stats';

/**
 * Rozpoczęcie zakupu: pakiet kredytów albo bilet na plan (przepustka Pro 7 dni, Pro/VIP 30 dni).
 *
 * Wszystko sprzedajemy jako płatność JEDNORAZOWĄ. Plan nie jest subskrypcją — po upływie
 * opłaconych dni konto samo wraca do darmowego i nic nie pobiera się automatycznie. Powód
 * jest praktyczny: płatności cykliczne w Stripe nie obsługują Przelewy24 ani BLIK-a, więc
 * abonament odnawialny działałby wyłącznie na kartę.
 *
 * Sesję tworzy WYŁĄCZNIE backend — klucz sekretny nie może trafić do przeglądarki, a kwota
 * nie może pochodzić z żądania. Klient przysyła sam identyfikator pakietu albo biletu; cenę
 * bierzemy z definicji po stronie serwera. Inaczej wystarczyłoby podmienić kwotę w narzędziach
 * deweloperskich, żeby kupić plan VIP za złotówkę.
 *
 * Odpowiedź to adres hostowanej strony Stripe'a. Parametry sesji (i to, dlaczego nic w nich
 * nie blokuje BLIK-a ani Przelewy24) — `lib/billing/checkoutSession.js`.
 *
 * OŚWIADCZENIE KONSUMENTA. Bez niego sesja w ogóle nie powstaje. Kupowane treści cyfrowe
 * udostępniamy natychmiast, a prawo odstąpienia wygasa dopiero wtedy, gdy konsument wyraźnie
 * zażądał rozpoczęcia świadczenia i przyjął do wiadomości utratę tego prawa. Regulamin obiecuje,
 * że takie oświadczenie odbieramy przy zakupie — ta trasa jest jedynym miejscem, w którym da
 * się tego dotrzymać, bo tylko tędy powstaje płatność.
 *
 * KODY BŁĘDÓW są dla interfejsu, który każdy zamienia na zdanie po ludzku (`PricingClient`):
 * 401 — sesja wygasła, 400 — brak oświadczenia albo nieznany przedmiot, 409 — nieaktualne
 * oświadczenie (`consent_outdated`) albo przepustka przy aktywnym planie 30-dniowym
 * (`pass_downgrade`), 503 — płatności nieskonfigurowane, 502 — Stripe odrzucił sesję.
 */

export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const config = getStripeConfig();
	const stripe = getStripe();
	if (!stripe || !config.ready) {
		console.warn('[stripe] checkout wywołany bez kompletnej konfiguracji', {
			hasKey: config.hasKey,
			hasAppUrl: config.hasAppUrl,
		});
		return Response.json({ error: 'payments_not_configured' }, { status: 503 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	// Język strony płatności Stripe'a, nazwy pozycji i adresu powrotu.
	const locale = body?.locale === 'en' ? 'en' : 'pl';
	// Okno zakupu, z którego przyszedł kupujący — tylko nazwy z listy, inne pomijamy.
	const source = isPlacement(body?.source) ? body.source : null;

	/*
	 * Jedna trasa obsługuje dwa rodzaje zakupu: pakiet kredytów albo bilet na plan.
	 *
	 * Oba są płatnościami jednorazowymi, więc dzielą całą resztę ścieżki — sesję, webhook,
	 * idempotencję i obsługę zwrotów. Rozdzielanie ich na osobne trasy oznaczałoby dwie
	 * kopie tego samego kodu obsługującego pieniądze.
	 */
	const pack = body?.packId ? getCreditPack(String(body.packId)) : null;
	const pass = body?.planId ? getPlanPass(String(body.planId)) : null;

	if (!pack && !pass) return Response.json({ error: 'unknown_item' }, { status: 400 });

	/*
	 * Oświadczenie sprawdzamy przed czymkolwiek płatnym.
	 *
	 * Wersję porównujemy dosłownie: przeglądarka mogła wczytać stronę przed zmianą regulaminu
	 * i pokazać nieaktualny tekst. Wtedy zgoda dotyczy innej treści niż obowiązująca, więc
	 * odsyłamy klienta po odświeżenie zamiast zapisywać oświadczenie na cudzy dokument.
	 */
	if (body?.acceptedImmediateDelivery !== true) {
		return Response.json({ error: 'consent_required' }, { status: 400 });
	}
	if (body?.consentVersion !== CONSENT_VERSION) {
		return Response.json({ error: 'consent_outdated', current: CONSENT_VERSION }, { status: 409 });
	}

	// „PRO", nie „PRO_WEEK" — przepustka to bilet na plan Pro, w nazwie pozycji mówią o tym dni.
	const nazwaPlanu = pass ? pass.planId.toUpperCase() : null;
	const item = pack
		? {
				kind: 'credits',
				id: pack.id,
				priceGrosze: pack.priceGrosze,
				name: locale === 'en' ? `${pack.credits} credits` : `Doładowanie ${pack.credits} kredytów`,
				description:
					locale === 'en'
						? 'Credits for match analyses and AI reports in Czat Sportowy.'
						: 'Kredyty na analizy meczów i raporty AI w serwisie Czat Sportowy.',
				metadata: { packId: pack.id, credits: String(pack.credits) },
			}
		: {
				kind: 'plan',
				id: pass.id,
				priceGrosze: pass.priceGrosze,
				name: locale === 'en' ? `${nazwaPlanu} plan — ${pass.days} days` : `Plan ${nazwaPlanu} — ${pass.days} dni`,
				description:
					locale === 'en'
						? `${pass.days} days of access. One-off payment — nothing renews automatically.`
						: `Dostęp na ${pass.days} dni. Płatność jednorazowa — nic nie odnawia się automatycznie.`,
				// `planId` to identyfikator BILETU (`pro_week`, `pro`, `vip`) — webhook szuka go w `PLAN_PASSES`.
				metadata: { planId: pass.id, days: String(pass.days) },
			};

	await connectToDb();
	const user = await User.findById(session.userId)
		.select('email username plan planStatus planValidUntil planPeriod role')
		.lean();
	if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

	/*
	 * Przepustka 7-dniowa przy aktywnym Pro/VIP na 30 dni nic by nie dała — mówimy to PRZED
	 * płatnością, zamiast przyjąć 19 zł za dni, które taniej dokłada się kolejnymi 30.
	 */
	if (pass) {
		const mozna = canBuyPass(user, pass.id);
		if (!mozna.ok) return Response.json({ error: mozna.reason }, { status: 409 });
	}

	/*
	 * Oświadczenie zapisujemy PRZED utworzeniem sesji, a jego treść bierzemy z własnego modułu,
	 * nie z żądania. Gdyby tekst przychodził z przeglądarki, dowodem byłoby to, co kupujący
	 * sam sobie wpisał. Identyfikator sesji dopisujemy zaraz po jej utworzeniu.
	 */
	const consentCopy = consentFor(locale);
	const consent = await PurchaseConsent.create({
		userId: session.userId,
		itemKind: item.kind,
		itemId: item.id,
		priceGrosze: item.priceGrosze,
		locale,
		statement: consentCopy.statement,
		termsVersion: CONSENT_VERSION,
		ip: getClientIp(request),
		userAgent: request.headers.get('user-agent')?.slice(0, 300) || null,
	});

	try {
		const checkout = await stripe.checkout.sessions.create(
			checkoutSessionParams({
				item,
				email: user.email,
				userId: session.userId,
				locale,
				appUrl: config.appUrl,
				consentId: consent._id,
				termsVersion: CONSENT_VERSION,
				source,
			})
		);

		/*
		 * Dowiązanie sesji do oświadczenia. Świadomie po cichu przy błędzie: płatność już
		 * istnieje, a oświadczenie jest zapisane — brak identyfikatora sesji utrudnia
		 * późniejsze zestawienie, ale nie jest powodem, żeby przerywać zakup.
		 */
		await PurchaseConsent.updateOne({ _id: consent._id }, { $set: { sessionId: checkout.id } }).catch(
			(error) => console.error('[stripe] nie udało się dowiązać sesji do oświadczenia', {
				consentId: String(consent._id),
				message: error.message,
			})
		);

		if (source) await recordUpsell({ placement: source, event: 'checkout' });

		return Response.json({ url: checkout.url }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		// Pełny komunikat do logu: sam `code` bywa ogólny i nie mówi, co odrzucił Stripe.
		console.error('[stripe] nie udało się utworzyć sesji', {
			message: error.message,
			type: error.type,
			item: item.id,
		});
		return Response.json({ error: 'checkout_failed' }, { status: 502 });
	}
}
