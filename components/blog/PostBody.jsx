import { cn } from '@/lib/utils';

/**
 * Renderer treści wpisu.
 *
 * Komponent serwerowy — tekst wpisu ma być w HTML-u od pierwszej chwili. Blog dorysowywany
 * JavaScriptem jest dla wyszukiwarki i dla asystenta AI stroną pustą.
 */
function Block({ block }) {
	if (block.type === 'ul') {
		return (
			<ul className="mt-4 flex flex-col gap-2">
				{block.items.map((item, i) => (
					/* Kropka rysowana ręcznie: preflight Tailwinda jest wyłączony, a globalny reset
					   zdejmuje znaki wypunktowania z list. */
					<li key={i} className="flex gap-3 text-base leading-relaxed text-muted">
						<span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
						<span>{item}</span>
					</li>
				))}
			</ul>
		);
	}

	if (block.type === 'h3') {
		return (
			<h3 className="mt-8 font-display text-lg font-bold uppercase tracking-wide text-text">
				{block.text}
			</h3>
		);
	}

	if (block.type === 'note') {
		return (
			<aside className="mt-6 rounded-[var(--radius-ui)] border-l-4 border-l-accent bg-surface-2 px-5 py-4 text-base leading-relaxed text-text">
				{block.text}
			</aside>
		);
	}

	return <p className="mt-4 text-base leading-relaxed text-muted">{block.text}</p>;
}

export default function PostBody({ content, className }) {
	return (
		<div className={cn('mt-10', className)}>
			{content.sections.map((section, index) => (
				<section key={section.heading} className={index > 0 ? 'mt-12' : undefined}>
					<h2 className="font-display text-xl font-bold text-text sm:text-2xl">{section.heading}</h2>
					{section.blocks.map((block, i) => (
						<Block key={i} block={block} />
					))}
				</section>
			))}
		</div>
	);
}
