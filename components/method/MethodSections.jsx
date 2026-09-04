import { ArrowRight, Check, Sparkles, Target, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

/**
 * Strona „Jak to liczymy" — komponenty SERWEROWE, bez ani jednego bajtu JavaScriptu.
 *
 * Treść ma trafić do HTML-a wysyłanego z serwera: to jedna z niewielu stron, którą ktoś
 * może znaleźć z wyszukiwarki, szukając odpowiedzi na pytanie „skąd oni biorą te liczby".
 *
 * UKŁAD PODPORZĄDKOWANY TEMU, ŻE NIKT NIE CZYTA DŁUGICH TEKSTÓW. Najpierw trzy zdania,
 * które wystarczą, żeby wyjść stąd z sensownym obrazem. Dopiero pod nimi rozwinięcie,
 * dla tych, którzy chcą wiedzieć więcej. Każda sekcja zaczyna się od jednego wyróżnionego
 * zdania, a szczegół idzie mniejszym drukiem pod spodem — czytelnik może przeskoczyć
 * całą stronę po samych nagłówkach i nadal wiedzieć, o co chodzi.
 */

function Section({ id, titleId, children, alt = false }) {
	return (
		<section
			id={id}
			aria-labelledby={titleId}
			className={`px-5 py-14 sm:py-16${alt ? ' bg-surface-2' : ''}`}
		>
			<div className="mx-auto w-full max-w-3xl">{children}</div>
		</section>
	);
}

function SectionTitle({ id, children }) {
	return (
		<h2
			id={id}
			className="font-display text-2xl font-bold uppercase tracking-wide text-text sm:text-3xl"
		>
			{children}
		</h2>
	);
}

export function MethodHero({ content }) {
	return (
		<section className="px-5 pb-10 pt-6 sm:pb-14">
			<div className="mx-auto w-full max-w-3xl">
				<Badge variant="outline">{content.eyebrow}</Badge>
				<h1 className="mt-4 font-display text-3xl font-bold uppercase leading-tight tracking-wide text-text sm:text-4xl">
					{content.title}
				</h1>
				{/* Zdanie wiodące większym stopniem pisma: przy przewijaniu telefonem bywa
				    jedyną rzeczą, którą ktoś naprawdę przeczyta. */}
				<p className="mt-4 text-lg leading-relaxed text-text sm:text-xl">{content.lead}</p>
			</div>
		</section>
	);
}

/** Trzy zdania, po których można wyjść ze strony i nadal rozumieć, jak to działa. */
export function MethodSummary({ content }) {
	return (
		<Section titleId="summary-title" alt>
			<SectionTitle id="summary-title">{content.title}</SectionTitle>

			<ul className="mt-6 flex flex-col gap-3">
				{content.items.map((item) => (
					<li key={item.highlight}>
						<Card className="border-l-4 border-l-accent">
							<CardContent className="flex gap-3 px-5 py-4">
								<Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
								<div>
									<p className="text-base font-semibold leading-snug text-text">{item.highlight}</p>
									<p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
								</div>
							</CardContent>
						</Card>
					</li>
				))}
			</ul>
		</Section>
	);
}

export function MethodSteps({ content }) {
	return (
		<Section titleId="steps-title">
			<SectionTitle id="steps-title">{content.title}</SectionTitle>

			<ol className="mt-6 flex flex-col gap-6">
				{content.items.map((step, index) => (
					<li key={step.title} className="flex gap-4">
						<span
							aria-hidden="true"
							className="font-display text-3xl font-bold tabular-nums leading-none text-accent/40"
						>
							{index + 1}
						</span>
						<div>
							<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">
								{step.title}
							</h3>
							<p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
						</div>
					</li>
				))}
			</ol>
		</Section>
	);
}

/**
 * Sedno całej strony: różnica między typem a truizmem.
 *
 * Przykład stoi w wyróżnionej ramce, bo to jedyny fragment, który tłumaczy regułę bez
 * używania słowa „próg". Trzy krótkie wiersze zamiast akapitu — każdy da się przeczytać
 * osobno i każdy jest osobnym krokiem rozumowania.
 */
export function MethodThreshold({ content }) {
	return (
		<Section titleId="threshold-title" alt>
			<SectionTitle id="threshold-title">{content.title}</SectionTitle>
			<p className="mt-4 text-base leading-relaxed text-muted">{content.body}</p>

			<Card className="mt-6 border-l-4 border-l-accent">
				<CardContent className="px-5 py-5">
					<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
						<Target size={14} aria-hidden="true" />
						{content.example.label}
					</p>
					<ul className="mt-3 flex flex-col gap-2.5">
						{content.example.lines.map((line, index) => (
							<li
								key={line}
								className={
									index === content.example.lines.length - 1
										? 'text-base font-semibold leading-snug text-text'
										: 'text-sm leading-relaxed text-muted'
								}
							>
								{line}
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<p className="mt-5 text-sm leading-relaxed text-muted">{content.fallback}</p>
		</Section>
	);
}

/** Ograniczenia wyliczone wprost — na stronie o metodzie to one budują zaufanie, nie zalety. */
export function MethodLimits({ content }) {
	return (
		<Section titleId="limits-title">
			<SectionTitle id="limits-title">{content.title}</SectionTitle>

			<ul className="mt-6 flex flex-col gap-3">
				{content.items.map((item) => (
					<li key={item.title}>
						<Card>
							<CardContent className="flex gap-3 px-5 py-4">
								<X size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-loss" />
								<div>
									<h3 className="text-base font-semibold leading-snug text-text">{item.title}</h3>
									<p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
								</div>
							</CardContent>
						</Card>
					</li>
				))}
			</ul>
		</Section>
	);
}

export function MethodProof({ content }) {
	return (
		<Section titleId="proof-title" alt>
			<SectionTitle id="proof-title">{content.title}</SectionTitle>
			<p className="mt-4 text-base leading-relaxed text-text">{content.body}</p>

			<ul className="mt-6 flex flex-col gap-2.5">
				{content.points.map((point) => (
					<li key={point} className="flex gap-3 text-sm leading-relaxed text-muted">
						<Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-win" />
						{point}
					</li>
				))}
			</ul>

			<Link
				href="/pilka-nozna/skutecznosc"
				className="mt-7 inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] bg-accent px-6 py-3 font-semibold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
			>
				{content.cta}
				<ArrowRight size={16} aria-hidden="true" />
			</Link>
		</Section>
	);
}

/**
 * Zajawka na stronie głównej — jedna karta, jedno zdanie, odnośnik do pełnej strony.
 *
 * Stoi zaraz po „Jak to działa", bo tam czytelnik dowiaduje się, CO robi serwis, i to jest
 * naturalny moment na pytanie, skąd biorą się liczby. Cała sekcja to jedna karta: metoda
 * jest ciekawa dla części odwiedzających, nie dla wszystkich, i nie może odbierać miejsca
 * temu, po co ludzie tu przychodzą.
 *
 * GÓRNY ODSTĘP JEST TU KONIECZNY, NIE OZDOBNY. Sekcja nad zajawką („Jak to działa") ma własne
 * tło, więc jej kolorowy blok kończy się dokładnie tam, gdzie zaczyna się ta sekcja. Bez `pt`
 * karta przykleja się do krawędzi bloku i czyta się jak jego urwany fragment, a nie jak osobny
 * element. Dolny odstęp może być mniejszy, bo sekcja pod spodem dokłada własny.
 */
export function MethodTeaser({ content }) {
	return (
		<section className="px-5 pb-6 pt-10 sm:pb-8 sm:pt-14">
			<div className="mx-auto w-full max-w-5xl">
				{/*
				 * `block` na odnośniku jest tu WYMAGANE, nie kosmetyczne.
				 *
				 * `Link` renderuje `<a>`, czyli element liniowy. Karta w środku jest blokiem,
				 * więc bez zblokowania odnośnika zapada się do kilku pikseli szerokości, a jej
				 * treść rozlewa się na kilkaset pikseli wysokości. W sekcji „Dyscypliny" ten sam
				 * wzorzec działa bez tej klasy tylko dlatego, że odnośnik jest tam dzieckiem
				 * siatki, a siatka blokuje swoje dzieci sama.
				 */}
				<Link href="/jak-to-dziala" className="block no-underline">
					<Card className="border-l-4 border-l-accent transition-transform hover:scale-[1.01]">
						<CardContent className="flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:gap-5">
							<Sparkles size={22} aria-hidden="true" className="shrink-0 text-accent" />
							<div className="min-w-0 flex-1">
								<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">
									{content.title}
								</h3>
								<p className="mt-1 text-sm leading-relaxed text-muted">{content.body}</p>
							</div>
							<span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent">
								{content.cta}
								<ArrowRight size={15} aria-hidden="true" />
							</span>
						</CardContent>
					</Card>
				</Link>
			</div>
		</section>
	);
}
