'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/**
 * Renderuje ustrukturyzowaną analizę meczu.
 *
 * Wcześniej analiza była jednym akapitem z `whiteSpace: 'pre-line'`, a prognozę
 * wyciągano z niej regexem po polskim słowie „Przewidywanie". Teraz dane przychodzą
 * w polach, więc można je pokazać jako paski, karty i plakietki.
 *
 * `sections` bywa puste dla rekordów zapisanych przed tą zmianą — wtedy pokazujemy
 * zapis tekstowy zamiast niczego.
 */

/** `neutral` celowo pominięte — plakietka ma sens tylko, gdy czynnik komuś sprzyja. */
const FAVORS_SIDES = new Set(['home', 'away']);

function ProbabilityBar({ homeName, awayName, probabilities }) {
	const { home = 0, draw = 0, away = 0 } = probabilities || {};
	const total = home + draw + away || 1;
	const segments = [
		{ key: 'home', value: home, label: homeName, className: 'bg-brand' },
		{ key: 'draw', value: draw, label: 'X', className: 'bg-draw' },
		{ key: 'away', value: away, label: awayName, className: 'bg-accent' },
	];

	return (
		<div>
			<div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
				{segments.map((s) => (
					<div
						key={s.key}
						className={s.className}
						style={{ width: `${(s.value / total) * 100}%` }}
						aria-hidden="true"
					/>
				))}
			</div>
			<div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
				{segments.map((s) => (
					<span key={s.key} className="flex items-center gap-1.5 text-muted">
						<span className={cn('h-2 w-2 rounded-full', s.className)} aria-hidden="true" />
						<span className="text-text">{s.value}%</span> {s.label}
					</span>
				))}
			</div>
		</div>
	);
}

function ConfidenceMeter({ value }) {
	// Podczas strumienia typ pojawia się przed swoją pewnością — bez tej osłony
	// szerokość paska wyszłaby jako `NaN%`, a obok wyświetliłoby się „NaN%".
	if (!Number.isFinite(value)) return null;

	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
				<div className="h-full bg-accent" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
			</div>
			<span className="text-xs font-semibold text-muted">{value}%</span>
		</div>
	);
}

/** Wartości znane schematowi; w trakcie strumienia pole bywa urwane (np. "goo"). */
const DATA_QUALITY = ['good', 'limited', 'insufficient'];

/** Dla dzisiejszych analiz sama godzina — data nic nie wnosi. */
function formatWhen(value, locale) {
	const date = new Date(value);
	const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
	if (date.toDateString() === new Date().toDateString()) return time;
	return `${date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${time}`;
}

export default function AnalysisPanel({
	sections,
	fallbackText,
	homeTeam,
	awayTeam,
	isPartial = false,
	meta = null,
	headerAction = null,
	className,
}) {
	const t = useTranslations('common');
	const locale = useLocale();

	if (!sections) {
		if (!fallbackText) return null;
		// Rekord sprzed wprowadzenia struktury — pokazujemy go tak, jak został zapisany.
		return (
			<Card className={className}>
				<CardContent className="whitespace-pre-line text-sm leading-relaxed">
					{fallbackText}
				</CardContent>
			</Card>
		);
	}

	const insufficient = sections.dataQuality === 'insufficient';
	// Klucz tłumaczenia budujemy z wartości pola, więc niedokończona wartość ze strumienia
	// wysypałaby `t()`. Plakietkę pokazujemy dopiero, gdy wartość jest jedną ze znanych.
	const showQuality = DATA_QUALITY.includes(sections.dataQuality);
	// Prawdopodobieństwa mają sens dopiero w komplecie — pojedyncza liczba w trakcie
	// pisania dałaby pasek pokazujący 100% dla jednej drużyny.
	const probabilitiesReady =
		sections.probabilities &&
		['home', 'draw', 'away'].every((key) => Number.isFinite(sections.probabilities[key]));

	// Każda wartość sprawdzana osobno — w trakcie strumienia część pól jeszcze nie istnieje,
	// a `${undefined}%` wyświetliłoby się jako „undefined%".
	const percent = (value) => (Number.isFinite(value) ? `${value}%` : '—');
	const goalStats = [
		{ label: t('expected_goals'), value: sections.goals?.expectedTotal ?? '—' },
		{ label: 'Over 2.5', value: percent(sections.goals?.over25) },
		{ label: 'BTTS', value: percent(sections.goals?.btts) },
	];

	return (
		<Card className={className}>
			{/* Akcja przy tytule, nie na dole karty: w trwającym meczu odświeżenie jest
			    najczęstszą czynnością, a pod analizą trzeba było do niej przewijać. */}
			<CardHeader className="flex-row flex-wrap items-center justify-between gap-2 px-5 py-3.5">
				<CardTitle className="text-base">{t('analysis_title')}</CardTitle>

				<div className="flex items-center gap-2">
					{isPartial ? (
						<Badge variant="outline">
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse"
							/>
							{t('analysis_writing')}
						</Badge>
					) : (
						showQuality && (
							<Badge
								variant={
									insufficient ? 'loss' : sections.dataQuality === 'limited' ? 'draw' : 'accent'
								}
							>
								{t(`data_quality_${sections.dataQuality}`)}
							</Badge>
						)
					)}
					{headerAction}
				</div>
			</CardHeader>

			{/*
			 * Odstępy przez `gap`, nie `space-y`.
			 *
			 * `space-y-*` ustawia margines na dzieciach, a stary `styles/LoginModal.scss`
			 * ma nieopakowane w warstwę `* { margin: 0 }` o tej samej (zerowej) sile co
			 * selektor generowany przez tę klasę — zmierzone `margin-top: 0px`, sekcje
			 * sklejone. `gap` nie jest marginesem, więc ta reguła go nie dotyczy.
			 */}
			<CardContent className="flex flex-col gap-8 px-5 py-5">
				<p className="text-[15px] leading-7 text-text">
					{sections.summary}
					{isPartial && sections.summary && (
						<span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-accent motion-safe:animate-pulse" />
					)}
				</p>

				{!insufficient && probabilitiesReady && (
					<ProbabilityBar
						homeName={homeTeam}
						awayName={awayTeam}
						probabilities={sections.probabilities}
					/>
				)}

				{sections.goals && !insufficient && (
					/*
					 * Liczby bramkowe zostają, ale z zastrzeżeniem.
					 *
					 * Sprawdziliśmy prognozy sumy goli i „obie strzelą" na 3541 rozegranych meczach:
					 * wypadają gorzej niż stałe zgadywanie średniej ligowej. Dlatego nie wystawiamy
					 * w nich typów — a skoro nie wystawiamy, nie wolno pokazywać tych procentów jak
					 * prognozy, za którą stoimy. Zostają jako opis charakteru meczu, z podpisem
					 * mówiącym wprost, ile są warte.
					 */
					<div>
						<div className="grid grid-cols-3 gap-3">
							{goalStats.map((stat) => (
								<div
									key={stat.label}
									className="rounded-[var(--radius-ui)] bg-surface-2 px-3 py-3.5 text-center"
								>
									<div className="text-xl font-bold text-text">{stat.value}</div>
									<div className="mt-1 text-xs text-muted">{stat.label}</div>
								</div>
							))}
						</div>
						<p className="mt-2 text-xs leading-relaxed text-muted">{t('goals_indicative')}</p>
					</div>
				)}

				{sections.keyFactors?.length > 0 && (
					<section>
						<h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
							{t('key_factors')}
						</h4>
						<ul className="[&>li+li]:mt-3">
							{sections.keyFactors.map((factor, idx) => (
								<li key={idx} className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3.5">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-sm font-semibold text-text">{factor.title}</span>
										{FAVORS_SIDES.has(factor.favors) && (
											<Badge variant="outline">
												{factor.favors === 'home' ? homeTeam : awayTeam}
											</Badge>
										)}
									</div>
									<p className="mt-2 text-sm leading-relaxed text-muted">{factor.detail}</p>
								</li>
							))}
						</ul>
					</section>
				)}

				{sections.picks?.length > 0 && (
					<section>
						<h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
							{t('picks')}
						</h4>
						<ul className="[&>li+li]:mt-3">
							{sections.picks.map((pick, idx) => (
								<li
									key={idx}
									className="rounded-[var(--radius-ui)] border border-border px-4 py-3.5"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="text-sm font-semibold text-text">
											{[pick.market, pick.selection].filter(Boolean).join(': ')}
										</span>
										<ConfidenceMeter value={pick.confidence} />
									</div>
									<p className="mt-2 text-sm leading-relaxed text-muted">{pick.rationale}</p>
								</li>
							))}
						</ul>
					</section>
				)}

				{sections.risks?.length > 0 && (
					<section>
						<h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
							{t('risks')}
						</h4>
						<ul className="list-outside list-disc pl-4 text-sm leading-relaxed text-muted [&>li+li]:mt-2">
							{sections.risks.map((risk, idx) => (
								<li key={idx}>{risk}</li>
							))}
						</ul>
					</section>
				)}

				{/* Stopka karty: autorstwo, czas powstania i klauzula. Jedna linia oddzielająca
				    zamiast dwóch — dwie kreski pod sobą wyglądały jak błąd składu. */}
				<div className="border-t border-border pt-5 [&>p+p]:mt-1.5">
					{meta?.generatedAt && (
						<p className="text-xs text-muted">
							{meta.isOwn
								? t('analysis_by_you', { when: formatWhen(meta.generatedAt, locale) })
								: meta.generatedByName
									? t('analysis_by_user', {
											who: meta.generatedByName,
											when: formatWhen(meta.generatedAt, locale),
										})
									: t('analysis_generated_at', { when: formatWhen(meta.generatedAt, locale) })}
						</p>
					)}
					<p className="text-xs leading-relaxed text-muted">{t('analysis_disclaimer')}</p>
				</div>
			</CardContent>
		</Card>
	);
}
