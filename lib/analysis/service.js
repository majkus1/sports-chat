import connectToDb from '@/lib/db';
import MatchAnalysis from '@/models/MatchAnalysis';
import FixtureSnapshot from '@/models/FixtureSnapshot';
import User from '@/models/User';
import { acquireAnalysisLock, releaseAnalysisLock } from '@/lib/redis';
import {
	checkQuota,
	checkAnalysisView,
	consumeQuota,
	recordUsage,
	hasFeature,
} from '@/lib/billing/entitlements';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { getAuthenticatedUser } from '@/lib/auth';
import { getClientIp } from '@/lib/requestIp';
import { buildFixtureBundle } from '@/lib/football/bundle';
import { PROMPT_VERSION } from '@/lib/ai/prompts/matchAnalysis';
import { leagueTier } from '@/lib/football/leagues';
import { recordPicks } from '@/lib/picks/service';
import { modelForBundle, marketForBundle, bindAnalysisToModel } from '@/lib/analysis/model';
import { marketProbabilityFor } from '@/lib/picks/policy';

/**
 * Które sekcje pakietu faktycznie niosą dane.
 *
 * `bundle.sections` mówi tylko, o co poprosiliśmy. Dostawca regularnie oddaje pustkę
 * (składy przed ogłoszeniem, tabela w pucharze), więc do oceny jakości liczy się to,
 * co w pakiecie naprawdę jest.
 */
function presentSections(bundle) {
	if (!bundle) return [];
	// `model` i `market` to nasze własne rachunki doklejone do pakietu, nie sekcje od dostawcy.
	const pomijane = new Set(['fetchedAt', 'sections', 'missing', 'model', 'market']);
	return Object.entries(bundle)
		.filter(([key, value]) => {
			if (pomijane.has(key)) return false;
			if (value === null || value === undefined) return false;
			if (Array.isArray(value)) return value.length > 0;
			if (typeof value === 'object') return Object.values(value).some((v) => v !== null);
			return true;
		})
		.map(([key]) => key);
}

/**
 * Wspólna część generowania analizy dla obu tras — zwykłej i strumieniowej.
 *
 * Bez tego modułu limity, blokada, cache i zapis musiałyby istnieć w dwóch kopiach,
 * a takie kopie rozjeżdżają się przy pierwszej zmianie reguł.
 */

/** Analiza meczu na żywo opisuje konkretną minutę — po kwadransie jest już nieaktualna. */
const LIVE_ANALYSIS_TTL_MS = 15 * 60 * 1000;

export const ANALYSIS_MESSAGES = {
	pl: {
		limitLoggedIn:
			'Wykorzystałeś dzienny limit analiz ({limit}) w swoim planie. Wróć jutro albo wybierz wyższy plan.',
		limitAnonymous:
			'Wykorzystałeś dzienny limit analiz ({limit}). Zaloguj się lub zarejestruj, aby generować więcej.',
		inProgress: 'Analiza jest już generowana. Poczekaj na jej zakończenie.',
		viewLimit:
			'Wykorzystałeś dzienny limit oglądania cudzych analiz ({limit}). Wygeneruj własną albo wybierz wyższy plan.',
		notFound: 'Nie znaleziono danych tego meczu.',
		cancelled: 'Ten mecz się nie odbędzie, więc nie ma czego prognozować.',
		loginRequired: 'Zaloguj się, aby wygenerować analizę. Nowe konto dostaje 10 analiz na start.',
		liveRequiresPlan: 'Analiza meczu na żywo jest dostępna w planie Pro i VIP.',
		busy: 'Generowanie analiz jest chwilowo wstrzymane. Spróbuj ponownie później.',
		refused: 'Model nie mógł przygotować analizy tego meczu.',
		failed: 'Nie udało się wygenerować analizy. Spróbuj ponownie za chwilę.',
	},
	en: {
		limitLoggedIn:
			'You have used your plan’s daily analysis limit ({limit}). Come back tomorrow or pick a higher plan.',
		limitAnonymous:
			'You have used the daily analysis limit ({limit}). Log in or register to generate more.',
		inProgress: 'An analysis is already being generated. Please wait for it to finish.',
		viewLimit:
			'You have used your daily limit of viewing other people’s analyses ({limit}). Generate your own or pick a higher plan.',
		notFound: 'Match data not found.',
		cancelled: 'This match will not be played, so there is nothing to predict.',
		loginRequired: 'Log in to generate an analysis. New accounts get 10 analyses to start.',
		liveRequiresPlan: 'Live match analysis is available on the Pro and VIP plans.',
		busy: 'Analysis generation is paused for now. Please try again later.',
		refused: 'The model could not prepare an analysis for this match.',
		failed: 'Could not generate the analysis. Please try again shortly.',
	},
};

export function resolveLanguage(request, bodyLanguage) {
	const header = request.headers.get('x-lang') || request.headers.get('accept-language') || '';
	return String(bodyLanguage || header)
		.toLowerCase()
		.startsWith('en')
		? 'en'
		: 'pl';
}

/**
 * Zamienia ustrukturyzowany wynik na tekst.
 *
 * Potrzebny w dwóch miejscach: stare rekordy w bazie mają wyłącznie tekst, a asystent
 * w czacie dostaje analizę jako kontekst — tam struktura nie jest potrzebna.
 */
export function sectionsToText(sections) {
	const lines = [sections.summary];

	if (sections.keyFactors?.length) {
		lines.push('', ...sections.keyFactors.map((f) => `• ${f.title}: ${f.detail}`));
	}

	const { home, draw, away } = sections.probabilities || {};
	if (Number.isFinite(home)) {
		lines.push('', `Szanse: gospodarze ${home}% / remis ${draw}% / goście ${away}%`);
	}

	if (sections.picks?.length) {
		lines.push(
			'',
			...sections.picks.map((p) => `${p.market}: ${p.selection} (${p.confidence}%) — ${p.rationale}`)
		);
	}

	if (sections.risks?.length) {
		lines.push('', ...sections.risks.map((r) => `Ryzyko: ${r}`));
	}

	return lines.filter((line) => line !== undefined && line !== null).join('\n');
}

/**
 * Wszystko, co musi się wydarzyć zanim odezwiemy się do modelu: tożsamość, plan, limit,
 * blokada przed równoległym generowaniem i sprawdzenie, czy analiza już istnieje.
 *
 * @returns {Promise<{ status: 'cached'|'blocked'|'ready', ... }>}
 */
export async function prepareAnalysis({ request, fixtureId, language, force = false }) {
	const t = ANALYSIS_MESSAGES[language];

	/*
	 * Tożsamość ustalamy tą samą drogą co reszta tras.
	 *
	 * Wcześniej było tu ręczne `verifyJwt`, które sprawdzało wyłącznie podpis i POMIJAŁO
	 * `tokenVersion`. Ten licznik jest w tej aplikacji mechanizmem unieważniania sesji —
	 * reset hasła go podbija, żeby wylogować wszystkie urządzenia. Skutek pominięcia: token
	 * wykradziony przed resetem hasła nadal generował analizy na koncie ofiary aż do swojego
	 * wygaśnięcia, mimo że wszędzie indziej był już odrzucany.
	 */
	const session = await getAuthenticatedUser();
	const userId = session?.userId || null;

	const ip = getClientIp(request);
	const lockKey = userId ? `user:${userId}` : `ip:${ip}`;

	if (!(await acquireAnalysisLock(lockKey))) {
		return { status: 'blocked', code: 'generation_in_progress', message: t.inProgress, httpStatus: 429 };
	}

	// Od tego miejsca każde wyjście musi zwolnić blokadę — inaczej użytkownik zostaje
	// zablokowany aż do wygaśnięcia klucza (5 minut).
	const release = () => releaseAnalysisLock(lockKey);

	try {
		await connectToDb();

		/*
		 * `force` przychodzi z przycisku „odśwież" w trwającym meczu: analiza sprzed gwizdka
		 * opisuje inną sytuację niż 60. minuta, a bez pominięcia cache'u nie dałoby się
		 * jej zastąpić. Limit jest naliczany normalnie, więc to nie jest furtka wokół planu.
		 */
		const user = userId
			? await User.findById(userId)
					.select('plan planStatus planValidUntil role credits createdAt')
					.lean()
			: null;

		const cached = force ? null : await MatchAnalysis.findOne({ fixtureId, language });
		if (cached && (!cached.expiresAt || cached.expiresAt > new Date())) {
			await release();

			// Kliknięcie „generuj" na istniejącej analizie to nadal jej obejrzenie — inaczej
			// tą drogą dałoby się ominąć dzienny limit odsłon.
			const isOwn = Boolean(userId && cached.generatedBy && String(cached.generatedBy) === String(userId));
			const view = await checkAnalysisView({ user, userId, ip, fixtureId, isOwn });

			if (!view.allowed) {
				return {
					status: 'blocked',
					code: 'view_limit_exceeded',
					message: t.viewLimit.replace('{limit}', String(view.limit)),
					limit: view.limit,
					used: view.used,
					plan: view.plan,
					isLoggedIn: Boolean(userId),
					httpStatus: 429,
				};
			}

			return { status: 'cached', analysis: cached.analysis, sections: cached.sections };
		}

		/*
		 * Generowanie wymaga konta.
		 *
		 * Wcześniej anonim miał własną pulę liczoną po adresie IP, którą obchodziło się
		 * trybem incognito albo zmianą sieci — czyli koszt modelu był w praktyce
		 * nieograniczony, a zakładanie konta nie dawało nic. Czytanie gotowych analiz
		 * zostaje otwarte (patrz limit odsłon wyżej), tworzenie nowych już nie.
		 */
		if (!userId) {
			await release();
			return {
				status: 'blocked',
				code: 'login_required',
				message: t.loginRequired,
				isLoggedIn: false,
				httpStatus: 401,
			};
		}

		// Bezpiecznik globalny: chroni przed błędem w pętli i skoordynowanym nadużyciem,
		// czego limity per konto z definicji nie wyłapią.
		const spend = await checkSpendCap();
		if (!spend.allowed) {
			await release();
			console.error(`[billing] dzienny próg wydatków przekroczony: $${spend.spent.toFixed(2)}/$${spend.cap}`);
			return {
				status: 'blocked',
				code: 'temporarily_unavailable',
				message: t.busy,
				httpStatus: 503,
			};
		}

		const quota = await checkQuota({ kind: 'analysis', user, userId, ip });
		if (!quota.allowed) {
			await release();
			const template = userId ? t.limitLoggedIn : t.limitAnonymous;
			return {
				status: 'blocked',
				code: 'limit_exceeded',
				message: template.replace('{limit}', String(quota.limit)),
				limit: quota.limit,
				used: quota.used,
				plan: quota.plan,
				isLoggedIn: Boolean(userId),
				httpStatus: 429,
			};
		}

		const bundle = await buildFixtureBundle(fixtureId);
		if (!bundle) {
			await release();
			return { status: 'blocked', code: 'not_found', message: t.notFound, httpStatus: 404 };
		}

		/*
		 * Mecz odwolany albo rozstrzygniety walkowerem juz sie nie odbedzie.
		 *
		 * Blokujemy przed naliczeniem limitu, a nie po: uzytkownik nie moze stracic jednej
		 * z trzech dziennych analiz na spotkanie, ktorego nie bedzie. Mecz przelozony
		 * przepuszczamy - ten sie odbedzie, tylko pozniej, i prompt o tym uprzedza.
		 */
		if (bundle.fixture.status.isCancelled) {
			await release();
			return { status: 'blocked', code: 'match_cancelled', message: t.cancelled, httpStatus: 409 };
		}

		/*
		 * Analiza meczu na żywo jest funkcją planu płatnego.
		 *
		 * Cennik obiecywał ją jako przewagę Pro/VIP, ale kod tego nie sprawdzał — darmowe
		 * konto generowało live bez ograniczeń. Sprawdzamy dopiero tutaj, bo status meczu
		 * znamy z pakietu; limit nie jest jeszcze naliczony, więc odmowa nic nie kosztuje.
		 */
		if (bundle.fixture.status.isLive && !hasFeature(user, 'live_analysis')) {
			await release();
			return {
				status: 'blocked',
				code: 'plan_required',
				message: t.liveRequiresPlan,
				isLoggedIn: true,
				httpStatus: 403,
			};
		}

		/*
		 * Własny model liczbowy doklejony do pakietu — to on liczy szanse i selekcje, model
		 * językowy je uzasadnia. `null` (liga spoza listy, nieznana drużyna, błąd sieci)
		 * znaczy dawną drogę: liczby pisze model językowy, polityka filtruje po fakcie.
		 */
		// Kursy przed modelem: model używa ich jako sufitu przy selekcjach.
		bundle.market = await marketForBundle(bundle);
		bundle.model = await modelForBundle(bundle);

		return { status: 'ready', bundle, user, userId, ip, quota, release };
	} catch (error) {
		await release();
		throw error;
	}
}

/** Zapis wyniku, podbicie licznika i wpis do dziennika kosztów. */
export async function finalizeAnalysis({
	fixtureId,
	language,
	sections,
	meta,
	bundle,
	user,
	userId,
	ip,
	quota,
}) {
	const fixture = bundle.fixture;

	/*
	 * Liczby wracają do modelu liczbowego, zanim cokolwiek zapiszemy.
	 *
	 * Model językowy dostał szanse i selekcje w prompcie i miał je przepisać; jeśli tego nie
	 * zrobił, wygrywa rachunek — zapisana analiza, typy i to, co widzi czytelnik, mają być
	 * jedną i tą samą liczbą. Bez modelu (`bundle.model` puste) odpowiedź zostaje jak jest.
	 */
	sections = bindAnalysisToModel(sections, bundle.model, {
		homeName: fixture.teams.home.name,
		awayName: fixture.teams.away.name,
	});

	const snapshot = await FixtureSnapshot.create({
		fixtureId,
		provider: process.env.FOOTBALL_PROVIDER || 'rapidapi',
		sections: bundle.sections,
		payload: bundle,
	});

	const analysisText = sectionsToText(sections);
	const isLive = bundle.fixture.status.isLive;

	await MatchAnalysis.updateOne(
		{ fixtureId, language },
		{
			$set: {
				analysis: analysisText,
				sections,
				provider: meta.provider,
				model: meta.model,
				promptVersion: PROMPT_VERSION,
				tokensIn: meta.tokensIn,
				tokensOut: meta.tokensOut,
				costUsd: meta.costUsd,
				snapshotId: snapshot._id,
				generatedBy: userId,
				expiresAt: isLive ? new Date(Date.now() + LIVE_ANALYSIS_TTL_MS) : null,
			},
		},
		{ upsert: true }
	);

	/*
	 * Typy zapisujemy osobno, w chwili powstania.
	 *
	 * Analiza meczu na żywo kasuje się z TTL po 15 minutach, więc gdyby typy żyły tylko
	 * w jej dokumencie, nie dałoby się ich rozliczyć po zakończeniu spotkania.
	 */
	await recordPicks({
		picks: sections?.picks || [],
		kind: fixture.status.isLive ? 'live' : 'prematch',
		source: 'analysis',
		userId,
		fixtureResolver: () => ({
			fixtureId,
			homeName: fixture.teams.home.name,
			awayName: fixture.teams.away.name,
			leagueName: fixture.league?.name ?? null,
			kickoff: fixture.date,
		}),
		/*
		 * Okoliczności powstania typu. `sectionsPresent` liczymy z faktycznej zawartości
		 * pakietu, nie z listy zamówionych sekcji — dostawca potrafi oddać pustkę i wtedy
		 * sekcja jest „zamówiona", ale w danych jej nie ma.
		 */
		context: (pick, normalized) => ({
			promptVersion: PROMPT_VERSION,
			modelVersion: meta.model ?? null,
			// Wersja NASZEGO modelu albo `null`, gdy liczby oszacował model językowy.
			numericModelVersion: bundle.model?.version ?? null,
			dataQuality: sections?.dataQuality ?? null,
			leagueId: fixture.league?.id ?? null,
			leagueTier: leagueTier(fixture.league?.id),
			sectionsPresent: presentSections(bundle),
			playedHome: bundle.form?.home?.played?.total ?? null,
			playedAway: bundle.form?.away?.played?.total ?? null,
			// Sufit rynkowy i materiał do pomiaru — z pakietu, nie z odpowiedzi modelu.
			marketProbability: marketProbabilityFor(normalized, bundle.market),
		}),
	});

	// Licznik podbijamy dopiero po udanym zapisie — nieudana próba nie ma kosztować limitu.
	await consumeQuota({ kind: 'analysis', user, userId, ip, usingCredit: quota.usingCredit });
	// Dzienna suma wydatków dla globalnego bezpiecznika.
	await recordSpend(meta.costUsd);
	await recordUsage({
		userId: userId || null,
		ip: userId ? null : ip,
		kind: 'analysis',
		plan: quota.plan,
		provider: meta.provider,
		model: meta.model,
		tokensIn: meta.tokensIn,
		tokensOut: meta.tokensOut,
		costUsd: meta.costUsd,
		fixtureId,
	});

	// Sekcje wracają związane z modelem — trasa ma wysłać dokładnie to, co zapisaliśmy.
	return { analysisText, sections };
}
