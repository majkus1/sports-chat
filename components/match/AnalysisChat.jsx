'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Lock, Send, Sparkles } from 'lucide-react';
import { UserContext } from '@/context/UserContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { cn } from '@/lib/utils';

/**
 * Rozmowa z asystentem pod analizą — prywatna, wyłącznie dla zalogowanego użytkownika.
 *
 * To celowo osobny kanał od `@AI` w czacie pokoju: tam pytanie i odpowiedź widzą wszyscy,
 * co powstrzymuje przed dopytywaniem o rzeczy oczywiste albo o własne typowanie. Wątek jest
 * zapisywany, więc wraca po odświeżeniu strony.
 */

/** Podpowiedzi na start — bez nich puste pole nie mówi, o co w ogóle można zapytać. */
const STARTER_KEYS = ['ai_chat_starter_1', 'ai_chat_starter_2', 'ai_chat_starter_3'];

function Bubble({ message }) {
	const isUser = message.role === 'user';
	return (
		<div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
			{!isUser && (
				<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
					<Bot size={15} aria-hidden="true" />
				</span>
			)}
			<div
				className={cn(
					'max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-ui)] px-3 py-2 text-sm leading-relaxed',
					isUser ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-text'
				)}
			>
				{message.content}
			</div>
		</div>
	);
}

export default function AnalysisChat({ fixtureId, language, className }) {
	const t = useTranslations('common');
	const { isAuthed } = useContext(UserContext);

	const [messages, setMessages] = useState([]);
	const [value, setValue] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState(null);
	const [limitReached, setLimitReached] = useState(false);
	const endRef = useRef(null);

	// Wątek zapisany wcześniej — rozmowa ma wracać po odświeżeniu strony.
	useEffect(() => {
		if (!isAuthed) return undefined;
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch(
					`/api/ai/ask?fixtureId=${encodeURIComponent(fixtureId)}&language=${language}`,
					{ credentials: 'include' }
				);
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled) setMessages(data.messages || []);
			} catch {
				/* brak historii nie jest błędem wartym pokazywania */
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [fixtureId, language, isAuthed]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: 'end' });
	}, [messages, isSending]);

	const ask = async (question) => {
		const trimmed = question.trim();
		if (!trimmed || isSending) return;

		setIsSending(true);
		setError(null);
		// Pytanie pokazujemy od razu; odpowiedź dopisze się po powrocie z serwera.
		setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
		setValue('');

		try {
			const res = await fetch('/api/ai/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ fixtureId, question: trimmed, language }),
			});
			const data = await res.json().catch(() => ({}));

			if (res.ok) {
				const reply = (data.messages || []).find((m) => m.role === 'assistant');
				if (reply) setMessages((prev) => [...prev, reply]);
				return;
			}

			if (res.status === 429) {
				setLimitReached(true);
				setError(t('ai_chat_limit'));
			} else if (res.status === 401) {
				setError(t('mustlog'));
			} else {
				setError(t('analysis_unavailable'));
			}
			// Nieudane pytanie znika z listy — inaczej sugerowałoby, że czeka na odpowiedź.
			setMessages((prev) => prev.slice(0, -1));
		} catch {
			setError(t('something_wrong'));
			setMessages((prev) => prev.slice(0, -1));
		} finally {
			setIsSending(false);
		}
	};

	if (!isAuthed) {
		return (
			<Card className={className}>
				<CardContent className="flex flex-col items-center gap-2 py-6 text-center">
					<span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
						<Lock size={18} aria-hidden="true" />
					</span>
					<p className="text-sm font-semibold text-text">{t('ai_chat_title')}</p>
					<p className="max-w-xs text-sm text-muted">{t('ai_chat_login_hint')}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className={className}>
			<CardContent className="flex flex-col gap-4 px-5 py-5">
				<div className="flex items-center gap-2">
					<Sparkles size={16} aria-hidden="true" className="text-accent" />
					<h3 className="text-sm font-bold text-text">{t('ai_chat_title')}</h3>
					<span className="ml-auto text-xs text-muted">{t('ai_chat_private')}</span>
				</div>

				{messages.length === 0 && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-muted">{t('ai_chat_intro')}</p>
						<div className="flex flex-wrap gap-1.5">
							{STARTER_KEYS.map((key) => (
								<button
									key={key}
									type="button"
									onClick={() => ask(t(key))}
									disabled={isSending}
									className="rounded-full border border-border bg-transparent px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-text"
								>
									{t(key)}
								</button>
							))}
						</div>
					</div>
				)}

				{messages.length > 0 && (
					<div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
						{messages.map((m, idx) => (
							<Bubble key={idx} message={m} />
						))}
						{isSending && (
							<p className="flex items-center gap-2 text-xs text-muted">
								<Bot size={14} aria-hidden="true" />
								{t('ai_chat_thinking')}
							</p>
						)}
						<div ref={endRef} />
					</div>
				)}

				{error && <p className="text-sm text-loss">{error}</p>}

				{!limitReached && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							ask(value);
						}}
						className="flex items-end gap-2"
					>
						<textarea
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									ask(value);
								}
							}}
							rows={1}
							maxLength={MAX_CHAT_MSG_LEN}
							placeholder={t('ai_chat_placeholder')}
							disabled={isSending}
							className="min-h-[42px] flex-1 resize-none rounded-[var(--radius-ui)] border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-ring"
						/>
						<Button
							type="submit"
							variant="accent"
							size="icon"
							disabled={isSending || !value.trim()}
							aria-label={t('sent')}
						>
							<Send size={16} aria-hidden="true" />
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
