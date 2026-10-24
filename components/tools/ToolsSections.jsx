import {
	Activity,
	ArrowRight,
	BarChart3,
	BookOpen,
	Bot,
	CalendarDays,
	Check,
	CircleHelp,
	ClipboardList,
	Compass,
	Contrast,
	Crown,
	FileText,
	ListChecks,
	Mail,
	MessagesSquare,
	Radio,
	ScrollText,
	Sparkles,
	Star,
	Target,
	Ticket,
	TrendingUp,
	Trophy,
	Zap,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/Badge';
import ToolAction from '@/components/tools/ToolAction';
import { ACCESS_LEVELS } from '@/lib/tools/content';
import { cn } from '@/lib/utils';

/**
 * Strona „Narzędzia" — komponenty SERWEROWE.
 *
 * Kafelki, nagłówki i opisy trafiają do HTML-a z serwera: to strona, którą ktoś przegląda
 * wzrokiem w poszukiwaniu „czy oni to mają", więc nie może czekać na JavaScript. Klientem są
 * wyłącznie dwie rzeczy, które bez niego nie mają sensu: przyciski otwierające panel konta
 * lub przewodnik (`ToolAction`) i zakończenie zależne od tego, czy ktoś jest zalogowany.
 *
 * Cały kafelek jest klikalny (odnośnik rozciągnięty pseudo-elementem na kartę), ale w drzewie
 * dostępności zostaje jeden odnośnik z opisową nazwą, a nie karta-przycisk z pięcioma
 * tekstami w środku. Fokus z klawiatury obrysowuje całą kartę.
 */

/** Ikony kafelków — nazwa w `lib/tools/content.js`, komponent tutaj (test pilnuje zgodności). */
const ICONS = {
	Activity,
	BarChart3,
	BookOpen,
	Bot,
	CalendarDays,
	CircleHelp,
	ClipboardList,
	Compass,
	FileText,
	ListChecks,
	Mail,
	MessagesSquare,
	Radio,
	ScrollText,
	Star,
	Target,
	Ticket,
	TrendingUp,
	Trophy,
	Zap,
};

/*
 * Oznaczenia dostępu. Kolory z tokenów, z kontrastem tekstu w obu motywach: ciemny tekst
 * na jasnej zieleni, jasny na granacie marki. Sama barwa nie niesie znaczenia — zawsze idzie
 * z ikoną i słowem.
 */
const ACCESS_STYLE = {
	free: { icon: Check, className: 'bg-accent-soft text-text' },
	partial: { icon: Contrast, className: 'border border-border-strong bg-surface text-text' },
	paid: { icon: Crown, className: 'bg-brand text-brand-fg' },
};

/** Akcent czytelny na jasnym tle (ciemniejsza zieleń) i na ciemnym (jaśniejsza). */
const ACCENT_TEXT = 'text-accent-hover dark:text-accent';

function AccessBadge({ level, access, prefix }) {
	const { icon: Icon, className } = ACCESS_STYLE[level];
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5',
				className
			)}
		>
			<Icon size={12} aria-hidden="true" />
			{prefix && <span className="sr-only">{prefix} </span>}
			{access[level].label}
		</span>
	);
}

function ToolIcon({ name, large = false }) {
	const Icon = ICONS[name] ?? Sparkles;
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft',
				large ? 'h-12 w-12' : 'h-11 w-11'
			)}
		>
			<Icon size={large ? 24 : 21} aria-hidden="true" className={ACCENT_TEXT} />
		</span>
	);
}

/**
 * Odnośnik kafelka. `after:` rozciąga obszar kliknięcia na całą kartę (karta ma `relative`).
 * Przy `action` ten sam odnośnik robi coś na miejscu — patrz `ToolAction`.
 */
function ToolLink({ tool, featured }) {
	const className = cn(
		'inline-flex items-center gap-1.5 font-sans font-semibold no-underline',
		"after:absolute after:inset-0 after:rounded-[var(--radius-ui)] after:content-['']",
		'focus-visible:outline-none',
		featured
			? 'rounded-[var(--radius-ui)] bg-accent px-4 py-2.5 text-sm text-accent-fg transition-colors group-hover:bg-accent-hover'
			: cn('text-sm', ACCENT_TEXT)
	);
	const content = (
		<>
			{tool.cta}
			<ArrowRight
				size={16}
				aria-hidden="true"
				className="transition-transform duration-150 motion-safe:group-hover:translate-x-0.5"
			/>
		</>
	);

	if (tool.action) {
		return (
			<ToolAction action={tool.action} href={tool.href} className={className}>
				{content}
			</ToolAction>
		);
	}
	return (
		<Link href={tool.href} className={className}>
			{content}
		</Link>
	);
}

export function ToolCard({ tool, access, accessPrefix, featured = false }) {
	const headingId = `${featured ? 'polecane' : 'narzedzie'}-${tool.id}`;
	return (
		<article
			aria-labelledby={headingId}
			className={cn(
				'group relative flex h-full w-full flex-col gap-3 rounded-[var(--radius-ui)] border bg-surface shadow-sm',
				'transition-[border-color,box-shadow] duration-150 hover:shadow-[var(--shadow-soft)]',
				// Fokus z klawiatury na odnośniku obrysowuje całą kartę, nie sam napis.
				'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg',
				featured
					? 'border-accent/60 px-5 py-6 hover:border-accent sm:px-6'
					: 'border-border px-5 py-5 hover:border-accent/60'
			)}
		>
			<div className="flex items-start gap-3">
				<ToolIcon name={tool.icon} large={featured} />
				<div className="flex min-w-0 flex-col items-start gap-1.5">
					<h3
						id={headingId}
						className={cn(
							'font-display font-bold uppercase leading-tight tracking-wide text-text break-words',
							featured ? 'text-lg' : 'text-base'
						)}
					>
						{tool.name}
					</h3>
					<AccessBadge level={tool.access} access={access} prefix={accessPrefix} />
				</div>
			</div>

			<p className="text-sm leading-relaxed text-muted">{tool.body}</p>

			{tool.note && (
				<p className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">{tool.note}</p>
			)}

			<div className="mt-auto pt-1">
				<ToolLink tool={tool} featured={featured} />
			</div>
		</article>
	);
}

/** Siatka: telefon — jedna kolumna, tablet — dwie, komputer — trzy. */
function ToolGrid({ tools, access, accessPrefix, featured = false }) {
	return (
		<ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{tools.map((tool) => (
				<li key={tool.id} className="flex">
					<ToolCard tool={tool} access={access} accessPrefix={accessPrefix} featured={featured} />
				</li>
			))}
		</ul>
	);
}

/** Nagłówek: tytuł, wstęp, legenda oznaczeń i skróty do grup. */
export function ToolsHero({ content: c }) {
	return (
		<header className="pt-2">
			<Badge variant="outline">{c.eyebrow}</Badge>
			<h1 className="mt-4 font-display text-3xl font-bold uppercase leading-tight tracking-wide text-text sm:text-4xl">
				{c.title}
			</h1>
			<p className="mt-4 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">{c.lead}</p>

			<ul aria-label={c.legendLabel} className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
				{ACCESS_LEVELS.map((level) => (
					<li key={level} className="flex flex-wrap items-center gap-2 text-xs text-muted">
						<AccessBadge level={level} access={c.access} />
						<span>{c.access[level].hint}</span>
					</li>
				))}
			</ul>

			{/* Skróty do grup — na telefonie lista jest długa, a tu widać od razu, co na niej jest. */}
			<nav aria-label={c.jumpLabel} className="mt-6">
				<ul className="flex flex-wrap gap-2">
					{c.groups.map((group) => (
						<li key={group.id}>
							<a
								href={`#${group.id}`}
								className="inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-text no-underline transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								{group.title}
							</a>
						</li>
					))}
				</ul>
			</nav>
		</header>
	);
}

/** Wyróżnione narzędzia — większe karty z wypełnionym przyciskiem, przed pełną listą. */
export function FeaturedTools({ content: c }) {
	if (!c.featured.length) return null;
	return (
		<section aria-labelledby="polecane" className="mt-10">
			<h2
				id="polecane"
				className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-text sm:text-2xl"
			>
				<Sparkles size={20} aria-hidden="true" className={ACCENT_TEXT} />
				{c.featured.title}
			</h2>
			<p className="mt-1.5 text-sm leading-relaxed text-muted">{c.featured.lead}</p>
			<ToolGrid tools={c.featured} access={c.access} accessPrefix={c.accessPrefix} featured />
		</section>
	);
}

export function ToolGroup({ group, access, accessPrefix }) {
	if (!group.tools.length) return null;
	const titleId = `${group.id}-tytul`;
	return (
		// `scroll-mt` — nagłówek strony jest przyklejony i zasłaniałby tytuł grupy po skoku z kotwicy.
		<section id={group.id} aria-labelledby={titleId} className="mt-12 scroll-mt-36">
			<h2 id={titleId} className="font-display text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
				{group.title}
			</h2>
			<p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{group.lead}</p>
			<ToolGrid tools={group.tools} access={access} accessPrefix={accessPrefix} />
		</section>
	);
}

export function ToolsDisclaimer({ text }) {
	return <p className="mt-8 text-xs leading-relaxed text-muted">{text}</p>;
}
