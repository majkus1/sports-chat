'use client';

import { useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

/**
 * Pole pytania do asystenta na stronie głównej — „jak ChatGPT, tylko o meczach".
 *
 * Asystent jest najcenniejszą rzeczą w serwisie, a dotąd prowadziła do niego tylko pozycja
 * w menu sekcji. Tu pytanie wpisuje się od razu, tam gdzie wzrok ląduje najpierw. Wysłanie
 * otwiera stronę asystenta z pytaniem w adresie (`?q=`): zalogowany dostaje odpowiedź od razu,
 * gość — prośbę o konto, a pytanie czeka w polu (`AssistantClient`).
 *
 * @param {{ content: { label: string, placeholder: string, button: string, hint: string, chips: string[] } }} props
 */
export default function HeroAsk({ content: c }) {
	const router = useRouter();
	const [value, setValue] = useState('');

	const go = (pytanie) => {
		const q = String(pytanie || '').trim();
		if (!q) return;
		router.push(`/pilka-nozna/asystent?q=${encodeURIComponent(q.slice(0, 500))}`);
	};

	return (
		<form
			className="mx-auto mt-8 w-full max-w-2xl"
			onSubmit={(e) => {
				e.preventDefault();
				go(value);
			}}
		>
			<label htmlFor="hero-ask" className="mb-2.5 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent">
				<Sparkles size={14} aria-hidden="true" />
				{c.label}
			</label>
			<div className="flex items-center gap-2 rounded-2xl border border-accent/50 bg-surface p-2 pl-4 shadow-[0_18px_50px_-24px_var(--accent)] transition-colors focus-within:border-accent">
				<input
					id="hero-ask"
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={c.placeholder}
					enterKeyHint="send"
					maxLength={500}
					autoComplete="off"
					className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-text placeholder:text-muted focus:outline-none"
				/>
				<button
					type="submit"
					aria-label={c.button}
					className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border-0 bg-accent px-3.5 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 sm:px-4"
				>
					<span className="hidden sm:inline">{c.button}</span>
					<ArrowUp size={18} aria-hidden="true" />
				</button>
			</div>
			<div className="mt-3 flex flex-wrap justify-center gap-2">
				{c.chips.map((chip) => (
					<button
						key={chip}
						type="button"
						onClick={() => go(chip)}
						className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-text"
					>
						{chip}
					</button>
				))}
			</div>
			<p className="mt-3 text-center text-xs leading-relaxed text-muted">{c.hint}</p>
		</form>
	);
}
