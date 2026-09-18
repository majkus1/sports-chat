'use client';

import { Link } from '@/i18n/routing';

/**
 * Minimalny render odpowiedzi: pogrubienie, odnośniki, listy, akapity.
 *
 * Nie pełny markdown — tylko to, o co prosi prompt. Odnośniki wewnętrzne idą przez `Link`,
 * żeby nawigacja była bez przeładowania. Zewnętrzne (źródła wiadomości) otwierają się
 * w nowej karcie z `rel="noopener"` — asystent nie tworzy innych odnośników zewnętrznych.
 */
function renderInline(text, keyPrefix) {
	const out = [];
	const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:\/|https?:\/\/)[^)\s]+)\)/g;
	let last = 0;
	let m;
	let i = 0;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) out.push(text.slice(last, m.index));
		if (m[1] !== undefined) {
			out.push(<strong key={`${keyPrefix}-b${i}`}>{m[1]}</strong>);
		} else if (/^https?:\/\//.test(m[3])) {
			out.push(
				<a
					key={`${keyPrefix}-l${i}`}
					href={m[3]}
					target="_blank"
					rel="noopener noreferrer"
					className="font-semibold text-accent underline"
				>
					{m[2]}
				</a>
			);
		} else {
			// Odnośnik z prefiksem języka („/pl/mecz/1") — `Link` sam dodaje prefiks, więc go zdejmujemy.
			const href = m[3].replace(/^\/(pl|en)(?=\/|$)/, '') || '/';
			out.push(
				<Link key={`${keyPrefix}-l${i}`} href={href} className="font-semibold text-accent underline">
					{m[2]}
				</Link>
			);
		}
		last = m.index + m[0].length;
		i += 1;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

export default function Answer({ text }) {
	const bloki = text.split(/\n{2,}/);
	return (
		<div className="flex flex-col gap-2">
			{bloki.map((blok, bi) => {
				const linie = blok.split('\n');
				const lista = linie.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
				if (lista) {
					return (
						<ul key={bi} className="flex flex-col gap-1.5 pl-1">
							{linie.map((l, li) => (
								<li key={li} className="flex gap-2">
									<span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
									<span>{renderInline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), `${bi}-${li}`)}</span>
								</li>
							))}
						</ul>
					);
				}
				return (
					<p key={bi}>
						{linie.map((l, li) => (
							<span key={li}>
								{renderInline(l, `${bi}-${li}`)}
								{li < linie.length - 1 && <br />}
							</span>
						))}
					</p>
				);
			})}
		</div>
	);
}
