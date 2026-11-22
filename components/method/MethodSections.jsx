import { ArrowRight, Check, ChevronDown, Target, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import RegisterCta, { GuestText } from '@/components/landing/RegisterCta';

/**
 * Strona „Jak to działa" — komponenty SERWEROWE (klientem jest tylko przycisk rejestracji).
 *
 * Treść ma trafić do HTML-a wysyłanego z serwera: to jedna z niewielu stron, którą ktoś
 * może znaleźć z wyszukiwarki, szukając odpowiedzi na pytanie „skąd oni biorą te liczby".
 *
 * UKŁAD PODPORZĄDKOWANY TEMU, ŻE NIKT NIE CZYTA DŁUGICH TEKSTÓW. Na wierzchu trzy zdania,
 * które wystarczą, żeby wyjść stąd z sensownym obrazem, i jeden przycisk. Rozwinięcie — kroki,
 * próg, ograniczenia, sprawdzian — leży w `details`: jest w dokumencie (robot i czytnik ekranu
 * je widzą), ale nie zajmuje ekranu komuś, kto chciał tylko skrótu.
 */

function Section({ id, titleId, children, alt = false }) {
	return (
		<section
			id={id}
			aria-labelledby={titleId}
			className={`px-5 py-12 sm:py-14${alt ? ' bg-surface-2' : ''}`}
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
		<section className="px-5 pb-8 pt-6 sm:pb-10">
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

/**
 * Trzy zdania, po których można wyjść ze strony i nadal rozumieć, jak to działa — i jedno
 * wezwanie: gość zakłada konto, zalogowany idzie do skuteczności (dowód, że to działa).
 */
export function MethodSummary({ content, cta, proofCta }) {
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
									<p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
								</div>
							</CardContent>
						</Card>
					</li>
				))}
			</ul>

			<div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
				<RegisterCta label={cta.register} userLabel={proofCta} userHref="/pilka-nozna/skutecznosc" />
				<p className="text-xs font-semibold text-muted">
					<GuestText guest={cta.note} />
				</p>
			</div>
		</Section>
	);
}

/** Jeden rozwijany blok szczegółów. Nagłówek `h3` w `summary` — struktura strony zostaje czytelna. */
function DetailsBlock({ id, title, children }) {
	return (
		<details id={id} className="group rounded-[var(--radius-ui)] border border-border bg-surface px-5 py-4">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none [&::-webkit-details-marker]:hidden">
				<h3 className="font-display text-base font-bold uppercase tracking-wide text-text">{title}</h3>
				<ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
			</summary>
			<div className="mt-4">{children}</div>
		</details>
	);
}

/** Szczegóły dla dociekliwych: cztery zwinięte bloki z pełnym wyjaśnieniem metody. */
export function MethodDetails({ content }) {
	const { steps, threshold, limits, proof } = content;
	return (
		<Section titleId="details-title">
			<SectionTitle id="details-title">{content.details.title}</SectionTitle>

			<div className="mt-6 flex flex-col gap-2">
				<DetailsBlock id="kroki" title={steps.title}>
					<ol className="flex flex-col gap-5">
						{steps.items.map((step, index) => (
							<li key={step.title} className="flex gap-4">
								<span aria-hidden="true" className="font-display text-3xl font-bold tabular-nums leading-none text-accent/40">
									{index + 1}
								</span>
								<div>
									<h4 className="text-base font-semibold leading-snug text-text">{step.title}</h4>
									<p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
								</div>
							</li>
						))}
					</ol>
				</DetailsBlock>

				{/*
				 * Sedno metody: różnica między typem a truizmem. Przykład stoi w wyróżnionej ramce, bo to
				 * jedyny fragment, który tłumaczy regułę bez słowa „próg" — wiersz po wierszu.
				 */}
				<DetailsBlock id="prog" title={threshold.title}>
					<p className="text-sm leading-relaxed text-muted">{threshold.body}</p>
					<div className="mt-4 rounded-[var(--radius-ui)] border-l-4 border-accent bg-surface-2 px-4 py-4">
						<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
							<Target size={14} aria-hidden="true" />
							{threshold.example.label}
						</p>
						<ul className="mt-3 flex flex-col gap-2.5">
							{threshold.example.lines.map((line, index) => (
								<li
									key={line}
									className={
										index === threshold.example.lines.length - 1
											? 'text-base font-semibold leading-snug text-text'
											: 'text-sm leading-relaxed text-muted'
									}
								>
									{line}
								</li>
							))}
						</ul>
					</div>
					<p className="mt-4 text-sm leading-relaxed text-muted">{threshold.fallback}</p>
				</DetailsBlock>

				{/* Ograniczenia wyliczone wprost — na stronie o metodzie to one budują zaufanie, nie zalety. */}
				<DetailsBlock id="czego-nie-robimy" title={limits.title}>
					<ul className="flex flex-col gap-4">
						{limits.items.map((item) => (
							<li key={item.title} className="flex gap-3">
								<X size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-loss" />
								<div>
									<h4 className="text-base font-semibold leading-snug text-text">{item.title}</h4>
									<p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
								</div>
							</li>
						))}
					</ul>
				</DetailsBlock>

				<DetailsBlock id="sprawdzian" title={proof.title}>
					<p className="text-sm leading-relaxed text-text">{proof.body}</p>
					<ul className="mt-4 flex flex-col gap-2.5">
						{proof.points.map((point) => (
							<li key={point} className="flex gap-3 text-sm leading-relaxed text-muted">
								<Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-win" />
								{point}
							</li>
						))}
					</ul>
					<Link
						href="/pilka-nozna/skutecznosc"
						className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
					>
						{proof.cta}
						<ArrowRight size={15} aria-hidden="true" />
					</Link>
				</DetailsBlock>
			</div>
		</Section>
	);
}
