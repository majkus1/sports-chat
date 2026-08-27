import connectToDb from '@/lib/db';
import User from '@/models/User';
import PurchaseConsent from '@/models/PurchaseConsent';
import { getAuthenticatedUser } from '@/lib/auth';
import { getCreditPack, getPlanPass } from '@/lib/billing/plans';
import { CONSENT_VERSION, consentFor } from '@/lib/legal/purchaseConsent';
import { getClientIp } from '@/lib/requestIp';
import { getStripe, getStripeConfig } from '@/lib/stripe/config';

/**
 * Rozpoczęcie zakupu: pakiet kredytów albo dostęp do planu na 30 dni.
 *
 * Obie rzeczy sprzedajemy jako płatność JEDNORAZOWĄ. Plan nie jest subskrypcją — po upływie
 * opłaconych dni konto samo wraca do darmowego i nic nie pobiera się automatycznie. Powód
 * jest praktyczny: płatności cykliczne w Stripe nie obsługują Przelewy24 ani BLIK-a, więc
 * abonament odnawialny działałby wyłącznie na kartę.
 *
 * Sesję tworzy WYŁĄCZNIE backend — klucz sekretny nie może trafić do przeglądarki, a kwota
 * nie może pochodzić z żądania. Klient przysyła sam identyfikator pakietu albo planu; cenę
 * bierzemy z definicji po stronie serwera. Inaczej wystarczyłoby podmienić kwotę w narzędziach
 * deweloperskich, żeby kupić plan VIP za złotówkę.
 *
 * Odpowiedź to adres hostowanej strony Stripe'a. Tam wyświetlą się metody płatności włączone
 * na koncie dla waluty PLN — karta, BLIK i Przelewy24. Nie wypisujemy ich w kodzie: Checkout
 * dobiera je sam do waluty i kraju kupującego, a sztywna lista rozjeżdża się z ustawieniami
 * panelu przy pierwszej zmianie.
 *
 * OŚWIADCZENIE KONSUMENTA. Bez niego sesja w ogóle nie powstaje. Kupowane treści cyfrowe
 * udostępniamy natychmiast, a prawo odstąpienia wygasa dopiero wtedy, gdy konsument wyraźnie
 * zażądał rozpoczęcia świadczenia i przyjął do wiadomości utratę tego prawa. Regulamin obiecuje,
 * że takie oświadczenie odbieramy przy zakupie — ta trasa jest jedynym miejscem, w którym da
 * się tego dotrzymać, bo tylko tędy powstaje płatność.
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

	// Język wpływa wyłącznie na nazwę pozycji widoczną na stronie płatności Stripe'a.
	const locale = body?.locale === 'en' ? 'en' : 'pl';

	/*
	 * Jedna trasa obsługuje dwa rodzaje zakupu: pakiet kredytów albo dostęp do planu na 30 dni.
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
				name:
					locale === 'en'
						? `${pass.id.toUpperCase()} plan — ${pass.days} days`
						: `Plan ${pass.id.toUpperCase()} — ${pass.days} dni`,
				description:
					locale === 'en'
						? `${pass.days} days of access. One-off payment — nothing renews automatically.`
						: `Dostęp na ${pass.days} dni. Płatność jednorazowa — nic nie odnawia się automatycznie.`,
				metadata: { planId: pass.id, days: String(pass.days) },
			};

	await connectToDb();
	const user = await User.findById(session.userId).select('email username').lean();
	if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

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
		const checkout = await stripe.checkout.sessions.create({
			// Jednorazowa, nie subskrypcja — BLIK i P24 nie obsługują płatności cyklicznych.
			mode: 'payment',
			currency: 'pln',
			/*
			 * Metod płatności NIE wypisujemy i nie włączamy osobnym parametrem.
			 *
			 * `automatic_payment_methods` należy do PaymentIntents — Checkout Session odrzuca je
			 * błędem „Received unknown parameter" i nie powstaje żadna sesja. W Checkoucie dobór
			 * metod jest domyślny: Stripe pokazuje to, co włączone w panelu dla waluty i kraju
			 * kupującego. Sztywna lista `payment_method_types` też jest zła — rozjeżdża się
			 * z ustawieniami panelu przy pierwszej zmianie.
			 */
			customer_email: user.email || undefined,
			client_reference_id: String(session.userId),
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: 'pln',
						// Bez katalogu produktów w Stripe: cennik żyje w kodzie i jest
						// wersjonowany razem z resztą, a zmiana ceny to jeden commit.
						product_data: { name: item.name, description: item.description },
						unit_amount: item.priceGrosze,
					},
				},
			],
			/*
			 * Metadane to jedyny most między płatnością a kontem.
			 *
			 * Webhook dostaje sesję Stripe'a, nie nasze żądanie — bez tych pól nie wiedziałby,
			 * komu i ile doładować. Trzymamy tu identyfikatory, nie dane: limit to 50 kluczy
			 * i 500 znaków na wartość.
			 */
			metadata: {
				userId: String(session.userId),
				...item.metadata,
				// Most w drugą stronę: z płatności w panelu Stripe'a do odebranego oświadczenia.
				consentId: String(consent._id),
				termsVersion: CONSENT_VERSION,
			},
			success_url: `${config.appUrl}/pl/cennik?platnosc=sukces&sid={CHECKOUT_SESSION_ID}`,
			cancel_url: `${config.appUrl}/pl/cennik?platnosc=anulowana`,
		});

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
