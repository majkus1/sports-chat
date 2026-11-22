import { ArrowRight, Bot, ChevronDown, FileText, Radio, ShieldCheck, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import RegisterTeaser from '@/components/landing/RegisterTeaser';
import RegisterCta, { GuestLink, GuestText } from '@/components/landing/RegisterCta';
import { registerHref } from '@/lib/trust/params';
import { cn } from '@/lib/utils';
import HeroAsk from '@/components/landing/HeroAsk';

/**
 * Sekcje strony głównej — komponenty SERWEROWE.
 *
 * Cała treść marketingowa musi znaleźć się w HTML-u wysyłanym z serwera. Robot wyszukiwarki
 * i asystent AI czytają odpowiedź na żądanie; to, co dorysuje się dopiero po uruchomieniu
 * JavaScriptu, dla części z nich nie istnieje. Klientem są tu wyłącznie żywy fragment rejestru
 * typów i przyciski zależne od sesji (`RegisterCta`).
 *
 * Struktura jest semantyczna, nie ozdobna: jeden `h1` w sekcji otwierającej, każda kolejna
 * sekcja jako `section` z własnym `h2` i powiązaniem przez `aria-labelledby`.
 *
 * 22.11.2026: z 11 sekcji zostało 6 (bez „Problemu", „Trzech kroków", zajawki metody
 * i „Dyscyplin") — każda z nich tłumaczyła, zamiast pokazywać, a kibic nie przychodzi czytać.
 */

const ICONS = { Bot, FileText, Radio, Target };

/** Przycisk-odnośnik. Klasy zamiast komponentu `Button`, żeby nie wciągać klienta bez potrzeby. */
function CtaLink({ href, children, variant = 'primary', size = 'md', className }) {
	return (
		<Link
			href={href}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)]',
				'font-semibold no-underline transition-colors',
				size === 'md' ? 'px-6 py-3' : 'px-4 py-2 text-sm',
				variant === 'primary' && 'bg-accent text-accent-fg hover:bg-accent-hover',
				variant === 'outline' && 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
				className
			)}
		>
			{children}
		</Link>
	);
}

/** Naprzemienne tło nadaje stronie rytm i oddziela sekcje bez rysowania kresek. */
function Section({ id, titleId, children, alt = false, className }) {
	return (
		<section
			id={id}
			aria-labelledby={titleId}
			className={cn('px-5 py-14 sm:py-16', alt && 'bg-surface-2', className)}
		>
			<div className="mx-auto w-full max-w-5xl">{children}</div>
		</section>
	);
}

function SectionTitle({ id, children }) {
	return (
		<h2 id={id} className="font-display text-2xl font-bold uppercase tracking-wide text-text sm:text-3xl">
			{children}
		</h2>
	);
}

/**
 * Tytuł nagłówka z polskim łamaniem.
 *
 * Na szerszych ekranach (od `md`) linia łamie się po pierwszym przecinku — „…asystent, / który zna
 * każdy mecz" czyta się jak dwie części zdania, a nie jak tekst ucięty w przypadkowym miejscu.
 * Jednoliterowe spójniki i przyimki (i, a, w, z, o, u) dostają twardą spację, żeby nie zostawały
 * same na końcu linii na telefonie (zasada polskiej typografii). Tekst w `h1` się nie zmienia —
 * robot i czytnik ekranu widzą to samo zdanie.
 */
function HeroTitle({ text }) {
	const zwiazane = text.replace(/(^|\s)([aiouwzAIOUWZ])\s/g, '$1$2 ');
	const i = zwiazane.indexOf(', ');
	if (i < 0) return zwiazane;
	return (
		<>
			{zwiazane.slice(0, i + 1)}
			<br className="hidden md:inline" aria-hidden="true" />
			<span className="md:hidden"> </span>
			{zwiazane.slice(i + 2)}
		</>
	);
}

/**
 * Nagłówek: co to jest, jeden przycisk, dlaczego nic nie ryzykujesz — i pole asystenta.
 *
 * Przycisk stoi zaraz pod podpisem, przed polem asystenta: na telefonie musi zmieścić się
 * na pierwszym ekranie. Gość zakłada konto (okno rejestracji), zalogowany idzie do typów na dziś.
 * Drugi przycisk („Jak to działa") zniknął — metoda jest w menu i w stopce, a dwa przyciski
 * obok siebie rozbijały wybór.
 */
export function Hero({ content }) {
	return (
		<section className="px-5 pb-12 pt-4 sm:pb-16">
			<div className="mx-auto w-full max-w-3xl text-center">
				<Badge variant="outline">{content.eyebrow}</Badge>

				{/* Jedyny `h1` w całym dokumencie — zawiera to, czego ludzie faktycznie szukają. */}
				<h1 className="mt-5 font-display text-3xl font-bold leading-tight text-text sm:text-5xl">
					<HeroTitle text={content.title} />
				</h1>

				<p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{content.subtitle}</p>

				<div className="mt-6 flex flex-col items-center gap-3">
					<RegisterCta label={content.primaryCta} userLabel={content.userCta} userHref="/typy-na-dzis" />
					<p className="text-xs font-semibold text-muted">
						<GuestText guest={content.trust} />
					</p>
				</div>

				{/* Asystent — najcenniejsza rzecz w serwisie — dostaje pole pytania od razu w nagłówku. */}
				{content.ask && <HeroAsk content={content.ask} />}

				{/* Odnośniki tekstowe, nie kolejne przyciski: typy na dziś (gość) i sprawdzalny wynik. */}
				<p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
					<GuestLink href="/typy-na-dzis" className="font-semibold text-accent no-underline hover:underline">
						{content.guestLink}
					</GuestLink>
					{content.registerCta && (
						<Link
							href={registerHref()}
							className="inline-flex items-center gap-1.5 font-semibold text-accent no-underline hover:underline"
						>
							<ShieldCheck size={15} aria-hidden="true" />
							{content.registerCta}
						</Link>
					)}
				</p>
			</div>
		</section>
	);
}

/** Cztery kafelki po jednym zdaniu — pełna lista narzędzi jest na `/narzedzia`. */
export function Features({ content }) {
	// Etykieta odnośnika z tłumaczeń, obok „Narzędzi" w menu i stopce — `landingContent` to tekst sprzedażowy.
	const t = useTranslations('common');
	return (
		<Section titleId="features-title">
			<SectionTitle id="features-title">{content.title}</SectionTitle>

			<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{content.items.map((item) => {
					const Icon = ICONS[item.icon];
					return (
						<Card key={item.title} className="h-full">
							<CardContent className="flex h-full flex-col gap-2 px-5 py-5">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
									<Icon size={20} aria-hidden="true" className="text-accent" />
								</span>
								<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">{item.title}</h3>
								<p className="text-sm leading-relaxed text-muted">{item.body}</p>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<Link
				href="/narzedzia"
				className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
			>
				{t('tools_see_all')}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</Section>
	);
}

/**
 * Rejestr typów — „sprawdzalny wynik". Tekst sekcji z serwera (widzi go robot i czytelnik bez
 * JavaScriptu), liczby i ostatnie typy z wysepki klienckiej. Notka 18+ i odpowiedzialna gra stoją
 * przy liczbach, nie tylko w stopce.
 *
 * Wyjaśnienie „dlaczego rynek, a nie procent trafień" zeszło stąd 22.11.2026 — to metoda, a jej
 * miejsce jest w rejestrze i na „Jak to działa", nie na stronie, która ma pokazać dowód w trzy sekundy.
 */
export function Register({ content, note }) {
	return (
		<Section id="rejestr" titleId="register-title">
			<div className="mx-auto max-w-3xl">
				<Badge variant="outline">
					<ShieldCheck size={12} aria-hidden="true" />
					{content.eyebrow}
				</Badge>
				<div className="mt-3">
					<SectionTitle id="register-title">{content.title}</SectionTitle>
				</div>
				<p className="mt-3 text-base leading-relaxed text-muted">{content.body}</p>

				<RegisterTeaser fallback={content.fallback} />

				<CtaLink href={registerHref()} variant="outline" className="mt-6">
					{content.cta}
					<ArrowRight size={18} aria-hidden="true" />
				</CtaLink>
				<p className="mt-4 text-xs leading-relaxed text-muted">{note}</p>
			</div>
		</Section>
	);
}

/**
 * Cennik w skrócie: cztery karty jak w cenniku, z przyciskiem tam, gdzie da się od razu zacząć.
 *
 * Wyróżniona karta to Pro na 7 dni — najtańsze wejście do Pro i jedyna karta z przyciskiem kupna
 * (`?oferta=pro_week` podświetla ją w cenniku). Darmowa ma przycisk rejestracji tylko dla gościa.
 * Pro i VIP na 30 dni bez przycisków: kto porównuje dłuższe bilety, i tak przejdzie do cennika.
 */
export function Pricing({ content, plans, freeLabel, daysLabel, buyWeekLabel, weekId }) {
	return (
		<Section titleId="pricing-title" alt>
			<SectionTitle id="pricing-title">{content.title}</SectionTitle>
			<p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{content.body}</p>

			<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{plans.map((plan) => {
					const tydzien = plan.id === weekId;
					return (
						<Card key={plan.id} className={cn('h-full', tydzien && 'border-accent ring-1 ring-accent')}>
							<CardContent className="flex h-full flex-col gap-2 px-5 py-5">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-xs font-bold uppercase tracking-wide text-muted">{plan.name}</p>
									{plan.badge && <Badge variant="outline">{plan.badge}</Badge>}
								</div>
								<p className="font-display text-2xl font-bold text-text">
									{plan.price === 0 ? (
										freeLabel
									) : (
										<>
											{plan.price} zł
											<span className="text-sm font-normal text-muted"> {daysLabel(plan.days)}</span>
										</>
									)}
								</p>
								<p className="text-sm leading-relaxed text-muted">{plan.summary}</p>
								{tydzien && (
									<CtaLink href={`/cennik?oferta=${weekId}`} size="sm" className="mt-auto self-start">
										{buyWeekLabel}
									</CtaLink>
								)}
								{plan.price === 0 && (
									<RegisterCta label={content.freeCta} variant="outline" size="sm" arrow={false} className="mt-auto self-start" />
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>

			<Link
				href="/cennik"
				className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
			>
				{content.cta}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</Section>
	);
}

/**
 * FAQ jako `details`/`summary` zamiast rozwijanej listy na JavaScripcie.
 *
 * Odpowiedzi są wtedy w dokumencie od pierwszej chwili — widzi je robot, widzi asystent AI
 * i widzi ktoś z wyłączonym JavaScriptem. Akordeon budowany na stanie Reacta trzyma tę treść
 * poza HTML-em, czyli poza zasięgiem połowy odbiorców. Używa go też strona „Jak to działa".
 *
 * `more` — opcjonalna linia pod listą z odnośnikiem do dalszych pytań.
 */
export function Faq({ title, items, more, alt = true, titleId = 'faq-title' }) {
	return (
		<Section titleId={titleId} alt={alt}>
			<div className="mx-auto max-w-3xl">
				<SectionTitle id={titleId}>{title}</SectionTitle>
				<FaqList items={items} />
				{more && (
					<p className="mt-5 text-sm text-muted">
						{more.text}{' '}
						<Link href={more.href} className="inline-flex items-center gap-1 font-semibold text-accent no-underline hover:underline">
							{more.link}
							<ArrowRight size={14} aria-hidden="true" />
						</Link>
					</p>
				)}
			</div>
		</Section>
	);
}

export function FaqList({ items }) {
	return (
		<div className="mt-6 flex flex-col gap-2">
			{items.map((item) => (
				<details key={item.question} className="group rounded-[var(--radius-ui)] border border-border bg-surface px-5 py-4">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-text marker:content-none [&::-webkit-details-marker]:hidden">
						{item.question}
						<ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
					</summary>
					<p className="mt-3 text-sm leading-relaxed text-muted">{item.answer}</p>
				</details>
			))}
		</div>
	);
}

/** Finał: gość — okres próbny i rejestracja; zalogowany — przejście do typów na dziś. */
export function FinalCta({ content, note }) {
	return (
		<Section titleId="cta-title">
			<div className="mx-auto max-w-2xl text-center">
				<SectionTitle id="cta-title">
					<GuestText guest={content.title} user={content.userTitle} />
				</SectionTitle>
				<p className="mt-3 text-base leading-relaxed text-muted">
					<GuestText guest={content.body} user={content.userBody} />
				</p>
				<RegisterCta label={content.cta} userLabel={content.userCta} userHref="/typy-na-dzis" className="mt-6" />
				<p className="mt-10 text-xs leading-relaxed text-muted">{note}</p>
			</div>
		</Section>
	);
}
