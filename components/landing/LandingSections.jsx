import {
	ArrowRight,
	FileText,
	MessagesSquare,
	Radio,
	Sparkles,
	Target,
	Trophy,
	Users,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import BallIcon from '@/components/icons/BallIcon';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import AccuracyTeaser from '@/components/landing/AccuracyTeaser';
import { cn } from '@/lib/utils';

/**
 * Sekcje strony głównej — komponenty SERWEROWE.
 *
 * Cała treść marketingowa musi znaleźć się w HTML-u wysyłanym z serwera. Robot wyszukiwarki
 * i asystent AI czytają odpowiedź na żądanie; to, co dorysuje się dopiero po uruchomieniu
 * JavaScriptu, dla części z nich nie istnieje. Klientem jest tu wyłącznie licznik skuteczności.
 *
 * Struktura jest semantyczna, nie ozdobna: jeden `h1` w sekcji otwierającej, każda kolejna
 * sekcja jako `section` z własnym `h2` i powiązaniem przez `aria-labelledby`.
 */

const ICONS = { FileText, Radio, Sparkles, MessagesSquare, Target, Trophy, Users };

/** Przycisk-odnośnik. Klasy zamiast komponentu `Button`, żeby nie wciągać klienta bez potrzeby. */
function CtaLink({ href, children, variant = 'primary', className }) {
	return (
		<Link
			href={href}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] px-6 py-3',
				'font-semibold no-underline transition-colors',
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
			className={cn('px-5 py-16 sm:py-20', alt && 'bg-surface-2', className)}
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

export function Hero({ content }) {
	return (
		<section className="px-5 pb-14 pt-4 sm:pb-20">
			<div className="mx-auto w-full max-w-3xl text-center">
				<Badge variant="outline">{content.eyebrow}</Badge>

				{/* Jedyny `h1` w całym dokumencie — zawiera to, czego ludzie faktycznie szukają. */}
				<h1 className="mt-5 font-display text-3xl font-bold leading-tight text-text sm:text-5xl">
					{content.title}
				</h1>

				<p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
					{content.subtitle}
				</p>

				<div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<CtaLink href="/pilka-nozna/przedmeczowe">
						{content.primaryCta}
						<ArrowRight size={18} aria-hidden="true" />
					</CtaLink>
					<CtaLink href="/cennik" variant="outline">
						{content.secondaryCta}
					</CtaLink>
				</div>

				<p className="mt-5 text-xs text-muted">{content.trust}</p>
			</div>
		</section>
	);
}

export function Problem({ content }) {
	return (
		<Section titleId="problem-title" alt>
			<div className="mx-auto max-w-3xl">
				<SectionTitle id="problem-title">{content.title}</SectionTitle>
				<p className="mt-4 text-base leading-relaxed text-muted">{content.body}</p>
				<p className="mt-4 border-l-2 border-accent pl-4 text-base leading-relaxed text-text">
					{content.solution}
				</p>
			</div>
		</Section>
	);
}

export function Features({ content }) {
	return (
		<Section titleId="features-title">
			<SectionTitle id="features-title">{content.title}</SectionTitle>

			<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{content.items.map((item) => {
					const Icon = ICONS[item.icon];
					return (
						<Card key={item.title} className="h-full">
							<CardContent className="flex h-full flex-col gap-3 px-5 py-5">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
									<Icon size={20} aria-hidden="true" className="text-accent" />
								</span>
								<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">
									{item.title}
								</h3>
								<p className="text-sm leading-relaxed text-muted">{item.body}</p>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</Section>
	);
}

export function HowItWorks({ content }) {
	return (
		<Section titleId="how-title" alt>
			<SectionTitle id="how-title">{content.title}</SectionTitle>

			<ol className="mt-8 grid gap-6 sm:grid-cols-3">
				{content.steps.map((step, index) => (
					<li key={step.title} className="flex flex-col gap-2">
						<span className="font-display text-4xl font-bold tabular-nums text-accent/40">
							{index + 1}
						</span>
						<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">
							{step.title}
						</h3>
						<p className="text-sm leading-relaxed text-muted">{step.body}</p>
					</li>
				))}
			</ol>
		</Section>
	);
}

export function Accuracy({ content, methodText }) {
	return (
		<Section titleId="accuracy-title">
			<div className="mx-auto max-w-3xl">
				<SectionTitle id="accuracy-title">{content.title}</SectionTitle>
				<p className="mt-4 text-base leading-relaxed text-muted">{content.body}</p>

				<AccuracyTeaser methodText={methodText} />

				<Link href="/pilka-nozna/skutecznosc" className="footer-link mt-5 inline-flex items-center gap-2">
					{content.cta}
					<ArrowRight size={15} aria-hidden="true" />
				</Link>
			</div>
		</Section>
	);
}

export function Sports({ content, categories, labelFor }) {
	return (
		<Section id="dyscypliny" titleId="sports-title" alt>
			<SectionTitle id="sports-title">{content.title}</SectionTitle>
			<p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{content.body}</p>

			<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{categories.map((sport) => (
					<Link key={sport.key} href={sport.sections[0].href} className="no-underline">
						<Card className="h-full border-l-4 border-l-accent transition-transform hover:scale-[1.02]">
							<CardContent className="flex items-center gap-3 px-5 py-4">
								<BallIcon className="h-7 w-7 text-accent" />
								<span className="text-base font-semibold text-text">{labelFor(sport.labelKey)}</span>
							</CardContent>
						</Card>
					</Link>
				))}

				{/* Kafel-zapowiedź. Pusty slot mówi więcej o kierunku produktu niż zdanie w tekście. */}
				<Card className="h-full border-dashed">
					<CardContent className="flex items-center gap-3 px-5 py-4">
						<span className="text-base font-semibold text-muted">{content.soon}</span>
					</CardContent>
				</Card>
			</div>
		</Section>
	);
}

export function Pricing({ content, plans, freeLabel, monthLabel }) {
	return (
		<Section titleId="pricing-title">
			<SectionTitle id="pricing-title">{content.title}</SectionTitle>
			<p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{content.body}</p>

			<div className="mt-8 grid gap-4 sm:grid-cols-3">
				{plans.map((plan) => (
					<Card
						key={plan.id}
						// Darmowy wyróżniony celowo: to on zdejmuje barierę wejścia, a nie plan za 99 zł.
						className={cn('h-full', plan.priceMonthlyPln === 0 && 'border-accent ring-1 ring-accent')}
					>
						<CardContent className="flex h-full flex-col gap-2 px-5 py-5">
							<p className="text-xs font-bold uppercase tracking-wide text-muted">{plan.name}</p>
							<p className="font-display text-2xl font-bold text-text">
								{plan.priceMonthlyPln === 0 ? (
									freeLabel
								) : (
									<>
										{plan.priceMonthlyPln} zł
										<span className="text-sm font-normal text-muted"> / {monthLabel}</span>
									</>
								)}
							</p>
							<p className="mt-1 text-sm leading-relaxed text-muted">{plan.summary}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<CtaLink href="/cennik" variant="outline" className="mt-8">
				{content.cta}
			</CtaLink>
		</Section>
	);
}

export function Faq({ title, items }) {
	return (
		<Section titleId="faq-title" alt>
			<div className="mx-auto max-w-3xl">
				<SectionTitle id="faq-title">{title}</SectionTitle>

				{/*
				 * `details`/`summary` zamiast rozwijanej listy na JavaScripcie.
				 *
				 * Odpowiedzi są wtedy w dokumencie od pierwszej chwili — widzi je robot, widzi
				 * asystent AI i widzi ktoś z wyłączonym JavaScriptem. Akordeon budowany na stanie
				 * Reacta trzyma tę treść poza HTML-em, czyli poza zasięgiem połowy odbiorców.
				 */}
				<div className="mt-6 flex flex-col gap-2">
					{items.map((item) => (
						<details
							key={item.question}
							className="group rounded-[var(--radius-ui)] border border-border bg-surface px-5 py-4"
						>
							<summary className="cursor-pointer list-none font-semibold text-text marker:content-none">
								{item.question}
							</summary>
							<p className="mt-3 text-sm leading-relaxed text-muted">{item.answer}</p>
						</details>
					))}
				</div>
			</div>
		</Section>
	);
}

export function FinalCta({ content, note }) {
	return (
		<Section titleId="cta-title">
			<div className="mx-auto max-w-2xl text-center">
				<SectionTitle id="cta-title">{content.title}</SectionTitle>
				<p className="mt-4 text-base leading-relaxed text-muted">{content.body}</p>
				<CtaLink href="/pilka-nozna/przedmeczowe" className="mt-7">
					{content.cta}
					<ArrowRight size={18} aria-hidden="true" />
				</CtaLink>
				<p className="mt-10 text-xs leading-relaxed text-muted">{note}</p>
			</div>
		</Section>
	);
}
