'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bot, ChevronDown, Lock, MessageSquare, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
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
 *
 * HISTORIA JAK W CHATGPT. Rozmowy są zapisywane osobno, z tytułem z pierwszego pytania;
 * lista stoi obok czatu (na telefonie — pod przyciskiem nad czatem). „Nowa rozmowa"
 * zaczyna pustą; wejście na stronę też zaczyna pustą, a nie ostatnią — bo najczęściej
 * przychodzi się z nowym pytaniem, a stare rozmowy są o kliknięcie dalej.
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

/** Względny czas na liście rozmów: „dziś", „wczoraj", data. */
function kiedy(iso, locale, t) {
	const d = new Date(iso);
	const dzis = new Date();
	const tenSamDzien = (a, b) => a.toDateString() === b.toDateString();
	if (tenSamDzien(d, dzis)) return t('assistant_today');
	const wczoraj = new Date(dzis.getTime() - 86_400_000);
	if (tenSamDzien(d, wczoraj)) return t('assistant_yesterday');
	return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

/** Lista rozmów: nowa, otwórz, usuń (z jednym potwierdzeniem w miejscu). */
function ConversationList({ conversations, activeId, onNew, onOpen, onDelete, locale }) {
	const t = useTranslations('common');
	const [doUsuniecia, setDoUsuniecia] = useState(null);

	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				onClick={onNew}
				className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] border-0 bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
			>
				<Plus size={15} aria-hidden="true" />
				{t('assistant_new_chat')}
			</button>

			{conversations.length === 0 ? (
				<p className="px-1 py-2 text-xs text-muted">{t('assistant_no_history')}</p>
			) : (
				<ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
					{conversations.map((c) => {
						const aktywna = c.id === activeId;
						const pytaOUsuniecie = doUsuniecia === c.id;
						return (
							<li key={c.id} className="group">
								{pytaOUsuniecie ? (
									<div className="flex items-center justify-between gap-2 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs">
										<span className="text-text">{t('assistant_delete_confirm')}</span>
										<span className="flex shrink-0 gap-1">
											<button
												type="button"
												onClick={() => {
													setDoUsuniecia(null);
													onDelete(c.id);
												}}
												className="rounded-full border-0 bg-loss px-2.5 py-1 text-xs font-semibold text-white"
											>
												{t('assistant_delete')}
											</button>
											<button
												type="button"
												onClick={() => setDoUsuniecia(null)}
												className="rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-text"
											>
												{t('assistant_cancel')}
											</button>
										</span>
									</div>
								) : (
									<div
										className={cn(
											'flex items-center gap-2 rounded-[var(--radius-ui)] px-3 py-2 transition-colors',
											aktywna ? 'bg-accent-soft' : 'hover:bg-surface-2'
										)}
									>
										<button
											type="button"
											onClick={() => onOpen(c.id)}
											className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
											aria-current={aktywna ? 'true' : undefined}
										>
											<span className={cn('block truncate text-sm', aktywna ? 'font-semibold text-text' : 'text-text')}>
												{c.title}
											</span>
											<span className="block text-[11px] text-muted">{kiedy(c.updatedAt, locale, t)}</span>
										</button>
										<button
											type="button"
											onClick={() => setDoUsuniecia(c.id)}
											aria-label={t('assistant_delete')}
											title={t('assistant_delete')}
											className="shrink-0 rounded-md border-0 bg-transparent p-1 text-muted opacity-60 transition-opacity hover:text-loss hover:opacity-100 group-hover:opacity-100"
										>
											<Trash2 size={14} aria-hidden="true" />
										</button>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

export default function AssistantClient() {
	const t = useTranslations('common');
	const locale = useLocale();
	const { isAuthed } = useContext(UserContext);

	const [conversations, setConversations] = useState([]);
	const [activeId, setActiveId] = useState(null);
	const [messages, setMessages] = useState([]);
	const [value, setValue] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [isOpening, setIsOpening] = useState(false);
	const [error, setError] = useState(null);
	const [limitReached, setLimitReached] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
	const endRef = useRef(null);

	const loadList = async () => {
		try {
			const res = await fetch(`/api/ai/assistant?language=${locale}`, { credentials: 'include' });
			if (!res.ok) return;
			const data = await res.json();
			setConversations(data.conversations || []);
		} catch {
			/* brak listy to nie błąd — czat działa bez niej */
		}
	};

	useEffect(() => {
		if (!isAuthed) return;
		loadList();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isAuthed, locale]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}, [messages, isSending]);

	const startNew = () => {
		setActiveId(null);
		setMessages([]);
		setError(null);
		setListOpen(false);
	};

	const openConversation = async (id) => {
		if (id === activeId) return;
		setIsOpening(true);
		setError(null);
		setListOpen(false);
		try {
			const res = await fetch(`/api/ai/assistant?language=${locale}&id=${id}`, { credentials: 'include' });
			if (!res.ok) {
				setError(t('assistant_error'));
				return;
			}
			const data = await res.json();
			setActiveId(data.id);
			setMessages(data.messages || []);
		} catch {
			setError(t('assistant_error'));
		} finally {
			setIsOpening(false);
		}
	};

	const deleteConversation = async (id) => {
		// Z ekranu znika od razu; serwer dogania. Nieudane usunięcie wróci przy odświeżeniu listy.
		setConversations((prev) => prev.filter((c) => c.id !== id));
		if (id === activeId) startNew();
		try {
			await fetch(`/api/ai/assistant?id=${id}`, { method: 'DELETE', credentials: 'include' });
		} catch {
			loadList();
		}
	};

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
				body: JSON.stringify({ question: q, language: locale, conversationId: activeId }),
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
			// Nowa rozmowa dostaje identyfikator i trafia na górę listy; istniejąca — tylko na górę.
			if (data.conversationId) {
				setActiveId(data.conversationId);
				setConversations((prev) => {
					const bez = prev.filter((c) => c.id !== data.conversationId);
					const stara = prev.find((c) => c.id === data.conversationId);
					return [
						{
							id: data.conversationId,
							title: data.title || stara?.title || q,
							updatedAt: new Date().toISOString(),
							messageCount: (stara?.messageCount || 0) + 2,
						},
						...bez,
					];
				});
			}
		} catch {
			setError(t('assistant_error'));
		} finally {
			setIsSending(false);
		}
	};

	const lista = (
		<ConversationList
			conversations={conversations}
			activeId={activeId}
			onNew={startNew}
			onOpen={openConversation}
			onDelete={deleteConversation}
			locale={locale}
		/>
	);

	return (
		<>
			<NavBar />
			<div className="content-league">
				<h1 className="h1-football">
					<BallIcon className="icon-sport" />
					{t('footbal')}
				</h1>

				<FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

				<div className="mx-auto w-full max-w-5xl">
					<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
						{t('assistant_title')}
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('assistant_intro')}</p>

					{!isAuthed ? (
						<Card className="mt-6 max-w-3xl">
							<CardContent className="flex flex-col items-center gap-3 px-5 py-8 text-center">
								<span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
									<Lock size={18} aria-hidden="true" />
								</span>
								<p className="text-sm font-semibold text-text">{t('assistant_title')}</p>
								<p className="max-w-xs text-sm text-muted">{t('assistant_login_hint')}</p>
							</CardContent>
						</Card>
					) : (
						<div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
							{/* Lista rozmów: na dużym ekranie obok, na telefonie pod przyciskiem. */}
							<aside className="hidden lg:block">
								<Card>
									<CardContent className="px-3 py-3">
										<p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
											<MessageSquare size={13} aria-hidden="true" />
											{t('assistant_history')}
										</p>
										{lista}
									</CardContent>
								</Card>
							</aside>

							<div className="lg:hidden">
								<button
									type="button"
									onClick={() => setListOpen((v) => !v)}
									aria-expanded={listOpen}
									className="flex w-full items-center justify-between rounded-[var(--radius-ui)] border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-text"
								>
									<span className="inline-flex items-center gap-2">
										<MessageSquare size={15} aria-hidden="true" className="text-accent" />
										{t('assistant_history')} ({conversations.length})
									</span>
									<ChevronDown size={16} aria-hidden="true" className={cn('transition-transform', listOpen && 'rotate-180')} />
								</button>
								{listOpen && (
									<Card className="mt-2">
										<CardContent className="px-3 py-3">{lista}</CardContent>
									</Card>
								)}
							</div>

							<Card>
								<CardContent className="flex flex-col gap-4 px-5 py-5">
									{isOpening && <Thinking />}

									{!isOpening && messages.length === 0 && (
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

									{!isOpening && messages.length > 0 && (
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
						</div>
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
