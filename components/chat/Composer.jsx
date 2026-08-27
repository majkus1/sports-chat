'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Send } from 'lucide-react';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { cn } from '@/lib/utils';

/** Podpowiedzi uruchamia `@` z co najmniej jednym znakiem po nim. */
const MENTION_TRIGGER = /@([\p{L}\p{N}_-]*)$/u;
/** Od tylu znaków zostało do limitu pokazujemy licznik. */
const COUNTER_THRESHOLD = 100;

/**
 * Pole pisania wiadomości.
 *
 * Zastępuje pojedynczy `<input>`: rośnie z treścią, rozróżnia Enter (wyślij) od
 * Shift+Enter (nowa linia) i podpowiada wzmianki. `@AI` jest zawsze pierwsze na liście,
 * bo wywołuje asystenta — reszta pozycji to użytkownicy obecni w pokoju.
 */
export default function Composer({ onSend, onTyping, roomUsers = [], disabled, className }) {
	const t = useTranslations('common');
	const [value, setValue] = useState('');
	const [suggestions, setSuggestions] = useState([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const textareaRef = useRef(null);
	const typingTimeoutRef = useRef(null);

	// Auto-wysokość: reset przed pomiarem, bo scrollHeight nigdy sam nie maleje.
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [value]);

	useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

	const updateSuggestions = useCallback(
		(text) => {
			const match = text.match(MENTION_TRIGGER);
			if (!match) {
				setSuggestions([]);
				return;
			}
			const query = match[1].toLowerCase();
			const candidates = ['AI', ...roomUsers.filter((u) => u.toLowerCase() !== 'ai')];
			setSuggestions(candidates.filter((u) => u.toLowerCase().startsWith(query)).slice(0, 6));
			setActiveIndex(0);
		},
		[roomUsers]
	);

	const handleChange = (event) => {
		const next = event.target.value.slice(0, MAX_CHAT_MSG_LEN);
		setValue(next);
		updateSuggestions(next);

		// Sygnał „pisze…" wysyłamy rzadko i wygaszamy po chwili bezczynności.
		onTyping?.();
		clearTimeout(typingTimeoutRef.current);
		typingTimeoutRef.current = setTimeout(() => onTyping?.(false), 2500);
	};

	const applySuggestion = (username) => {
		const next = value.replace(MENTION_TRIGGER, `@${username} `);
		setValue(next);
		setSuggestions([]);
		textareaRef.current?.focus();
	};

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setValue('');
		setSuggestions([]);
		clearTimeout(typingTimeoutRef.current);
		onTyping?.(false);
	};

	const handleKeyDown = (event) => {
		if (suggestions.length) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setActiveIndex((i) => (i + 1) % suggestions.length);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				applySuggestion(suggestions[activeIndex]);
				return;
			}
			if (event.key === 'Escape') {
				setSuggestions([]);
				return;
			}
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	};

	const remaining = MAX_CHAT_MSG_LEN - value.length;

	return (
		<div className={cn('relative border-t border-border bg-surface p-2', className)}>
			{suggestions.length > 0 && (
				<ul
					role="listbox"
					className="absolute bottom-full left-2 mb-2 w-56 overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface shadow-lg"
				>
					{suggestions.map((username, index) => (
						<li key={username}>
							<button
								type="button"
								role="option"
								aria-selected={index === activeIndex}
								onMouseDown={(e) => {
									e.preventDefault();
									applySuggestion(username);
								}}
								className={cn(
									'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
									index === activeIndex ? 'bg-surface-2 text-text' : 'text-muted'
								)}
							>
								{username === 'AI' && <Bot size={14} className="text-accent" aria-hidden="true" />}
								<span className="font-semibold">@{username}</span>
								{username === 'AI' && (
									<span className="ml-auto text-xs text-muted">{t('ask_ai')}</span>
								)}
							</button>
						</li>
					))}
				</ul>
			)}

			<div className="flex items-end gap-2">
				<textarea
					ref={textareaRef}
					rows={1}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					disabled={disabled}
					placeholder={t('write')}
					aria-label={t('write')}
					className={cn(
						'min-h-10 flex-1 resize-none rounded-[var(--radius-ui)] border border-border bg-surface-2',
						'px-3 py-2 text-base leading-relaxed text-text placeholder:text-muted',
						'focus:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
						'disabled:cursor-not-allowed disabled:opacity-60'
					)}
				/>
				<button
					type="button"
					onClick={submit}
					disabled={disabled || !value.trim()}
					aria-label={t('sent')}
					className={cn(
						'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-ui)]',
						'bg-accent text-accent-fg transition-colors hover:bg-accent-hover',
						'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
						'disabled:pointer-events-none disabled:opacity-50'
					)}
				>
					<Send size={18} aria-hidden="true" />
				</button>
			</div>

			{remaining <= COUNTER_THRESHOLD && (
				<p className={cn('mt-1 text-right text-xs', remaining <= 0 ? 'text-loss' : 'text-muted')}>
					{remaining}
				</p>
			)}
		</div>
	);
}
