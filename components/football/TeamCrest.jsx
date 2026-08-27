'use client';

import { cn } from '@/lib/utils';

/**
 * Monogram drużyny w miejsce herbu.
 *
 * Herby klubów to zarejestrowane znaki towarowe klubów i federacji. Dostawca danych
 * wprost zaznacza, że nie ma do nich praw i przekazuje odpowiedzialność na klienta,
 * więc przy serwisie płatnym pokazywanie ich jest ryzykiem, a nie udogodnieniem.
 * Inicjały spełniają tę samą rolę — pozwalają odróżnić drużyny w wierszu — i nie
 * obciążają cudzych serwerów obrazkami z hotlinku.
 */

/**
 * Skróty klubowe na początku nazwy pomijamy przy inicjałach.
 *
 * Bez tego „FC Tokyo" daje „FT", a „AC Milan" — „AM", czyli skróty nic nie mówiące.
 * Po odrzuceniu przedrostka wychodzi „TO" i „MI", które od razu widać, o kogo chodzi.
 */
const CLUB_PREFIXES = new Set([
	'fc', 'ac', 'sc', 'cf', 'as', 'sk', 'ks', 'rc', 'cd', 'us', 'ss', 'sv', 'vfl', 'vfb', 'fk', 'nk', 'if', 'bk',
]);

/** Dwuliterowy skrót nazwy drużyny. */
export function teamInitials(name) {
	const words = String(name || '')
		.replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
		.split(/[\s'-]+/)
		.filter(Boolean);

	// Przedrostek odrzucamy tylko wtedy, gdy zostaje z czego zbudować skrót.
	const parts =
		words.length > 1 && CLUB_PREFIXES.has(words[0].toLowerCase()) ? words.slice(1) : words;

	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * Barwa wyliczana z nazwy — ta sama drużyna zawsze dostaje ten sam odcień, więc oko
 * łapie ją na liście bez czytania. Jasność 55% czyta się i na jasnym, i na ciemnym tle.
 */
function hueFromName(name) {
	let hash = 0;
	for (const char of String(name || '')) hash = (hash * 31 + char.codePointAt(0)) % 360;
	return hash;
}

const SIZES = {
	sm: 'h-5 w-5 text-[0.5rem]',
	md: 'h-8 w-8 text-[0.7rem]',
};

export default function TeamCrest({ name, size = 'md', className }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-display font-bold tabular-nums',
				SIZES[size],
				className
			)}
			style={{ color: `hsl(${hueFromName(name)} 55% 55%)` }}
		>
			{teamInitials(name)}
		</span>
	);
}
