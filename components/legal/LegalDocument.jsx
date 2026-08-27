'use client';

import { useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * Renderer dokumentów prawnych.
 *
 * Treść trzymamy w `lib/legal/documents.js`, a nie w `messages/*.json`: regulamin to kilkanaście
 * akapitów na sekcję, więc w pliku tłumaczeń interfejsu zginęłyby zwykłe etykiety, a każda
 * poprawka prawna dotykałaby pliku zmienianego przy okazji każdej nowej funkcji.
 */

function Block({ block }) {
	if (block.type === 'ul') {
		return (
			<ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted">
				{block.items.map((item, i) => (
					/* Kropkę rysujemy ręcznie: preflight Tailwinda jest wyłączony, a globalny
					   reset zdejmuje znaki wypunktowania z list. */
					<li key={i} className="flex gap-2">
						<span aria-hidden="true" className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
						<span>{item}</span>
					</li>
				))}
			</ul>
		);
	}

	if (block.type === 'table') {
		return (
			<div className="mt-4 overflow-x-auto">
				<table className="w-full min-w-[32rem] border-collapse text-sm">
					<thead>
						<tr>
							{block.head.map((cell) => (
								<th key={cell} className="border-b border-border px-3 py-2 text-left font-semibold text-text">
									{cell}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{block.rows.map((row, i) => (
							<tr key={i}>
								{row.map((cell, j) => (
									<td key={j} className="border-b border-border px-3 py-2 align-top text-muted">
										{cell}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	return <p className="mt-3 text-sm leading-relaxed text-muted">{block.text}</p>;
}

export default function LegalDocument({ document: doc, updatedAt }) {
	const locale = useLocale();

	return (
		<article>
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text sm:text-3xl">
				{doc.title}
			</h1>
			<p className="mt-2 text-xs text-muted">
				{doc.updatedLabel} {new Date(updatedAt).toLocaleDateString(locale)}
			</p>
			{doc.intro && <p className="mt-4 text-sm leading-relaxed text-muted">{doc.intro}</p>}

			<div className="mt-8 flex flex-col gap-4">
				{doc.sections.map((section, index) => (
					<Card key={section.heading}>
						<CardContent className="px-5 py-5">
							<h2 className="font-display text-base font-bold uppercase tracking-wide text-text">
								<span className="mr-2 text-muted">§{index + 1}</span>
								{section.heading}
							</h2>
							{section.blocks.map((block, i) => (
								<Block key={i} block={block} />
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</article>
	);
}
