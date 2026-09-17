'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bot, Lock, RotateCcw, Send, Sparkles } from 'lucide-react';
import BallIcon from '@/components/icons/BallIcon';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import { UserContext } from '@/context/UserContext';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { cn } from '@/lib/utils';

/**
 * Asystent całej oferty — jedna rozmowa o wszystkich meczach dnia.
 *
 * Różnica wobec „Dopytaj AI o ten mecz": tam rozmowa dotyczy jednego spotkania i siedzi
 * pod jego analizą, tu jest osobna strona i pytania o całą ofertę. Odpowiedź nie jest
 * strumieniowana — asystent najpierw pyta narzędzia (terminarz, model, statystyka), a to
 * trwa kilka sekund. Żeby czekanie nie było głuche, pokazujemy kolejne kroki: „sprawdzam
 * terminarz", „liczę model", „układam odpowiedź". To nie jest prawdziwy postęp, tylko
 * rytm — ale rytm, który mówi użytkownikowi, że coś się dzieje i co.
 *
 * Podpowiedzi na start są ważniejsze niż w czacie meczu: puste pole nie mówi, o co
 * w ogóle wolno spytać, a to jest cała wartość tej strony.
 */

const STARTERS = [
	'assistant_starter_1',
	'assistant_starter_2',
	'assistant_starter_5',
	'assistant_starter_3',
	'assistant_starter_4',
];
const THINKING_STEPS = ['assistant_step_1', 'assistant_step_2', 'assistant_step_3'];

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

function Answer({ text }) {
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
					'max-w-[88%] rounded-[var(--radius-ui)] px-3.5 py-2.5 text-sm leading-relaxed',
					isUser ? 'whitespace-pre-wrap bg-brand text-brand-fg' : 'bg-surface-2 text-text'
				)}
			>
				{isUser ? message.content : <Answer text={message.content} />}
			</div>
		</div>
	);
}

/** Rytm oczekiwania: kolejne kroki co półtorej sekundy, ostatni zostaje. */
function Thinking() {
	const t = useTranslations('common');
	const [krok, setKrok] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setKrok((k) => Math.min(k + 1, THINKING_STEPS.length - 1)), 1500);
		return () => clearInterval(id);
	}, []);
	return (
		<p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
			<Sparkles size={14} aria-hidden="true" className="animate-pulse text-accent" />
			{t(THINKING_STEPS[krok])}
		</p>
	);
}

export default function AssistantClient() {
	const t = useTranslations('common');
	const locale = useLocale();
	const { isAuthed } = useContext(UserContext);

	const [messages, setMessages] = useState([]);
	const [value, setValue] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState(null);
	const [limitReached, setLimitReached] = useState(false);
	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
	const endRef = useRef(null);

	useEffect(() => {
		if (!isAuthed) return undefined;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/ai/assistant?language=${locale}`, { credentials: 'include' });
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled) setMessages(data.messages || []);
			} catch {
				/* brak historii to nie błąd */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isAuthed, locale]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}, [messages, isSending]);

	const ask = async (question) => {
		const q = question.trim();
		if (!q || isSending) return;
		setError(null);
		setValue('');
		setMessages((prev) => [...prev, { role: 'user', content: q }]);
		setIsSending(true);
		try {
			const res = await fetch('/api/ai/assistant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ question: q, language: locale }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.status === 429) {
				setLimitReached(true);
				setError(data.message || t('ai_chat_limit'));
				return;
			}
			if (!res.ok) {
				setError(data.message || t('assistant_error'));
				return;
			}
			const odpowiedz = (data.messages || []).find((m) => m.role === 'assistant');
			if (odpowiedz) setMessages((prev) => [...prev, odpowiedz]);
		} catch {
			setError(t('assistant_error'));
		} finally {
			setIsSending(false);
		}
	};

	const reset = async () => {
		setMessages([]);
		setError(null);
		setLimitReached(false);
		try {
			await fetch(`/api/ai/assistant?language=${locale}`, { method: 'DELETE', credentials: 'include' });
		} catch {
			/* wątek i tak zniknął z ekranu */
		}
	};

	return (
		<>
			<NavBar />
			<div className="content-league">
				<h1 className="h1-football">
					<BallIcon className="icon-sport" />
					{t('footbal')}
				</h1>

				<FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

				<div className="mx-auto w-full max-w-3xl">
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
							{t('assistant_title')}
						</h2>
						{messages.length > 0 && (
							<button
								type="button"
								onClick={reset}
								className="ml-auto inline-flex items-center gap-1.5 border-0 bg-transparent text-xs text-muted hover:text-text"
							>
								<RotateCcw size={13} aria-hidden="true" />
								{t('assistant_reset')}
							</button>
						)}
					</div>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('assistant_intro')}</p>

					{!isAuthed ? (
						<Card className="mt-6">
							<CardContent className="flex flex-col items-center gap-3 px-5 py-8 text-center">
								<span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
									<Lock size={18} aria-hidden="true" />
								</span>
								<p className="text-sm font-semibold text-text">{t('assistant_title')}</p>
								<p className="max-w-xs text-sm text-muted">{t('assistant_login_hint')}</p>
							</CardContent>
						</Card>
					) : (
						<Card className="mt-6">
							<CardContent className="flex flex-col gap-4 px-5 py-5">
								{messages.length === 0 && (
									<div className="flex flex-col gap-3">
										<p className="text-sm text-text">{t('assistant_empty')}</p>
										<div className="flex flex-wrap gap-2">
											{STARTERS.map((key) => (
												<button
													key={key}
													type="button"
													onClick={() => ask(t(key))}
													disabled={isSending}
													className="rounded-full border border-border bg-transparent px-3.5 py-2 text-sm text-text transition-colors hover:border-accent hover:bg-accent-soft"
												>
													{t(key)}
												</button>
											))}
										</div>
									</div>
								)}

								{messages.length > 0 && (
									<div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
										{messages.map((m, idx) => (
											<Bubble key={idx} message={m} />
										))}
										{isSending && <Thinking />}
										<div ref={endRef} />
									</div>
								)}
								{messages.length === 0 && isSending && <Thinking />}

								{error && <p className="text-sm text-loss">{error}</p>}
								{limitReached && (
									<Link href="/cennik" className="text-sm font-semibold text-accent underline">
										{t('see_plans')}
									</Link>
								)}

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
											placeholder={t('assistant_placeholder')}
											disabled={isSending}
											className="min-h-[44px] flex-1 resize-none rounded-[var(--radius-ui)] border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-ring"
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

								<p className="text-xs leading-relaxed text-muted">{t('assistant_footnote')}</p>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			<Footer className="mx-5" />

			{isResultsModalOpen && (
				<FullScreenModal
					onClose={() => setIsResultsModalOpen(false)}
					src={`/api/widgets/games?locale=${locale}`}
				/>
			)}
		</>
	);
}
