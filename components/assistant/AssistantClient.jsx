'use client';

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { Skeleton } from '@/components/ui/Skeleton';
import Answer from '@/components/assistant/Answer';
import { Button } from '@/components/ui/Button';
import AutoGrowTextarea from '@/components/ui/AutoGrowTextarea';
import { MAX_CHAT_MSG_LEN } from '@/lib/chatConstraints';
import { cn } from '@/lib/utils';
import {
	NEW_KEY,
	claimMemory,
	conversationKey,
	hrefWithConversation,
	idFromSearch,
	memory,
	readDraft,
	sendQuestion,
	writeDraft,
} from '@/lib/assistant/clientMemory';

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
 *
 * NAWIGACJA BEZ GUBIENIA STANU. Otwarta rozmowa jest w adresie (`?c=<id>`), a przejście między
 * rozmowami to wpis w historii przeglądarki — „Wstecz" wraca do poprzedniej rozmowy, odświeżenie
 * i powrót z meczu (klik w odnośnik w odpowiedzi) otwierają tę samą. Wczytane rozmowy, miejsce
 * przewinięcia, szkic wiadomości i pytanie w toku żyją w `lib/assistant/clientMemory.js`, dłużej
 * niż ten komponent: powrót jest natychmiastowy, a odpowiedź, na którą się czekało, pojawia się,
 * choćby w międzyczasie oglądało się inną stronę.
 */

const STARTERS = [
	'assistant_starter_1',
	'assistant_starter_2',
	'assistant_starter_5',
	'assistant_starter_3',
	'assistant_starter_4',
];
const THINKING_STEPS = ['assistant_step_1', 'assistant_step_2', 'assistant_step_3'];

function Bubble({ message }) {
	const isUser = message.role === 'user';
	return (
		<div data-role={message.role} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
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
	const { isAuthed, authChecked, user } = useContext(UserContext);

	// Adres czytamy dopiero w przeglądarce — do tego czasu (i przy renderze serwera) szkielet.
	const [ready, setReady] = useState(false);
	const [activeId, setActiveId] = useState(null);
	const [conversations, setConversations] = useState(() => memory.list || []);
	const [messages, setMessages] = useState([]);
	const [value, setValue] = useState('');
	const [waiting, setWaiting] = useState(false);
	const [isOpening, setIsOpening] = useState(false);
	const [error, setError] = useState(null);
	const [limitReached, setLimitReached] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

	const key = conversationKey(activeId);
	const keyRef = useRef(key);
	keyRef.current = key;
	const mounted = useRef(false);
	const boxRef = useRef(null);
	const inputRef = useRef(null);
	/** Dokąd przewinąć okno wiadomości po najbliższym renderze: `bottom`, `answer`, `restore`. */
	const scrollTarget = useRef(null);

	/** Inne konto w tej samej karcie — pamięć poprzedniego nie może się pokazać. */
	useEffect(() => {
		if (claimMemory(user?.userId || null)) setConversations([]);
	}, [user?.userId]);

	/* ---------- adres: która rozmowa jest otwarta ---------- */
	useEffect(() => {
		mounted.current = true;
		const read = () => setActiveId(idFromSearch(window.location.search));
		read();
		setReady(true);
		// „Wstecz" i „Dalej" między rozmowami — Next przywraca adres, my czytamy z niego rozmowę.
		window.addEventListener('popstate', read);
		return () => {
			mounted.current = false;
			window.removeEventListener('popstate', read);
		};
	}, []);

	/** Przejście do rozmowy (`null` = nowa): wpis w historii, żeby „Wstecz" wracał do poprzedniej. */
	const goTo = useCallback((id, { replace = false } = {}) => {
		window.history[replace ? 'replaceState' : 'pushState'](null, '', hrefWithConversation(window.location.href, id));
		setActiveId(id);
	}, []);

	/* ---------- lista rozmów ---------- */
	useEffect(() => {
		if (!isAuthed) return;
		let cancelled = false;
		fetch(`/api/ai/assistant?language=${locale}`, { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (cancelled || !data) return;
				memory.list = data.conversations || [];
				setConversations(memory.list);
			})
			.catch(() => {
				/* brak listy to nie błąd — czat działa bez niej */
			});
		return () => {
			cancelled = true;
		};
	}, [isAuthed, locale]);

	/* ---------- odpowiedź na pytanie (także zadane przed wyjściem ze strony) ---------- */
	const applyResult = useCallback(
		(result, pending) => {
			if (!mounted.current) return;
			setConversations(memory.list || []);
			// Odpowiedź przyszła, gdy użytkownik patrzy już na inną rozmowę — zmienia się tylko lista.
			if (keyRef.current !== pending.key) return;
			setWaiting(false);
			if (result.status === 'ok') {
				scrollTarget.current = 'answer';
				setMessages(result.messages);
				// Nowa rozmowa dostała zapis — adres ją wskazuje, ale bez nowego wpisu w historii.
				if (pending.key === NEW_KEY) goTo(result.conversationId, { replace: true });
				return;
			}
			// Błąd albo limit: pytanie wraca do pola, żeby wystarczył jeden klik, by wysłać je znowu.
			setMessages(pending.previous);
			setValue((v) => v || pending.question);
			writeDraft(pending.key, pending.question);
			if (result.status === 'limit') {
				setLimitReached(true);
				setError(result.message || t('ai_chat_limit'));
			} else {
				setError(result.message || t('assistant_error'));
			}
		},
		[goTo, t]
	);

	const awaitPending = useCallback(
		(pending) => {
			pending.promise.then((result) => applyResult(result, pending));
		},
		[applyResult]
	);

	/* ---------- otwarcie rozmowy z adresu: z pamięci od razu, z serwera tylko raz ---------- */
	useEffect(() => {
		if (!ready || !isAuthed) return undefined;
		setIsOpening(false);
		setValue(readDraft(key));

		const pending = memory.pending?.key === key ? memory.pending : null;
		if (pending) {
			scrollTarget.current = 'bottom';
			setMessages([...pending.previous, { role: 'user', content: pending.question }]);
			setWaiting(true);
			awaitPending(pending);
			return undefined;
		}
		setWaiting(false);

		if (!activeId) {
			setMessages([]);
			return undefined;
		}
		const cached = memory.conversations.get(activeId);
		if (cached) {
			scrollTarget.current = 'restore';
			setMessages(cached);
			return undefined;
		}

		let cancelled = false;
		setIsOpening(true);
		setMessages([]);
		fetch(`/api/ai/assistant?language=${locale}&id=${activeId}`, { credentials: 'include' })
			.then(async (res) => {
				if (cancelled) return;
				if (res.status === 404) {
					// Usunięta albo cudza — zamiast pustego ekranu nowa rozmowa i jedno zdanie wyjaśnienia.
					setError(t('assistant_not_found'));
					goTo(null, { replace: true });
					return;
				}
				if (!res.ok) {
					setError(t('assistant_error'));
					return;
				}
				const data = await res.json();
				if (cancelled) return;
				memory.conversations.set(data.id, data.messages || []);
				scrollTarget.current = 'restore';
				setMessages(data.messages || []);
			})
			.catch(() => {
				if (!cancelled) setError(t('assistant_error'));
			})
			.finally(() => {
				if (!cancelled) setIsOpening(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready, isAuthed, activeId]);

	/* ---------- przewijanie okna wiadomości (nie całej strony) ---------- */
	useLayoutEffect(() => {
		const box = boxRef.current;
		const target = scrollTarget.current;
		if (!box || !target) return;
		scrollTarget.current = null;
		if (target === 'restore') {
			const saved = memory.scroll.get(key);
			box.scrollTop = saved ?? box.scrollHeight;
		} else if (target === 'answer') {
			// Początek odpowiedzi, nie jej koniec: pytanie na górze okna, odpowiedź czyta się od pierwszego zdania.
			const questions = box.querySelectorAll('[data-role="user"]');
			const last = questions[questions.length - 1];
			box.scrollTop = last ? Math.max(0, last.offsetTop - 8) : box.scrollHeight;
		} else {
			box.scrollTop = box.scrollHeight;
		}
	}, [messages, waiting, key]);

	/* ---------- działania ---------- */
	const startNew = () => {
		setError(null);
		setListOpen(false);
		if (activeId) goTo(null);
		// Już na nowej rozmowie — od razu do pisania.
		requestAnimationFrame(() => inputRef.current?.focus());
	};

	const openConversation = (id) => {
		setListOpen(false);
		if (id === activeId) return;
		setError(null);
		goTo(id);
	};

	const deleteConversation = async (id) => {
		// Z ekranu znika od razu; serwer dogania. Nieudane usunięcie wróci przy odświeżeniu listy.
		memory.list = (memory.list || conversations).filter((c) => c.id !== id);
		memory.conversations.delete(id);
		memory.scroll.delete(id);
		writeDraft(id, '');
		setConversations(memory.list);
		if (id === activeId) goTo(null, { replace: true });
		try {
			await fetch(`/api/ai/assistant?id=${id}`, { method: 'DELETE', credentials: 'include' });
		} catch {
			/* lista odświeży się przy następnym wejściu */
		}
	};

	const ask = (question) => {
		const q = question.trim();
		if (!q || memory.pending) return;
		setError(null);
		const previous = messages;
		setValue('');
		writeDraft(key, '');
		scrollTarget.current = 'bottom';
		setMessages([...previous, { role: 'user', content: q }]);
		setWaiting(true);
		awaitPending(sendQuestion({ question: q, id: activeId, language: locale, previous }));
	};

	const onType = (text) => {
		setValue(text);
		writeDraft(key, text);
	};

	// Asystent kończy odpowiedź w innej rozmowie — drugie pytanie naraz poczeka.
	const busyElsewhere = Boolean(memory.pending) && memory.pending.key !== key;
	const activeTitle = activeId ? conversations.find((c) => c.id === activeId)?.title : null;

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

					{!authChecked || (isAuthed && !ready) ? (
						// Sesja jeszcze się sprawdza — szkielet zamiast kłódki, która mignęłaby zalogowanemu.
						<div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
							<Skeleton className="hidden h-48 lg:block" />
							<Skeleton className="h-64" />
						</div>
					) : !isAuthed ? (
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
							<aside className="hidden lg:sticky lg:top-24 lg:block">
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
									{/* Nagłówek rozmowy: gdzie jestem i jak zacząć od nowa — bez szukania listy. */}
									<div className="-mt-1 flex items-center justify-between gap-3 border-b border-border pb-3">
										<p className="min-w-0 truncate text-sm font-semibold text-text">
											{activeTitle || (activeId ? '…' : t('assistant_new_chat'))}
										</p>
										{activeId && (
											<button
												type="button"
												onClick={startNew}
												className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:border-accent hover:bg-accent-soft"
											>
												<Plus size={13} aria-hidden="true" />
												{t('assistant_new_chat')}
											</button>
										)}
									</div>

									{isOpening && (
										<p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
											<Sparkles size={14} aria-hidden="true" className="animate-pulse text-accent" />
											{t('assistant_loading')}
										</p>
									)}

									{!isOpening && messages.length === 0 && !waiting && (
										<div className="flex flex-col gap-3">
											<p className="text-sm text-text">{t('assistant_empty')}</p>
											<div className="flex flex-wrap gap-2">
												{STARTERS.map((k) => (
													<button
														key={k}
														type="button"
														onClick={() => ask(t(k))}
														disabled={Boolean(memory.pending)}
														className="rounded-full border border-border bg-transparent px-3.5 py-2 text-sm text-text transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
													>
														{t(k)}
													</button>
												))}
											</div>
										</div>
									)}

									{!isOpening && messages.length > 0 && (
										<div
											ref={boxRef}
											onScroll={(e) => memory.scroll.set(key, e.currentTarget.scrollTop)}
											className="relative flex max-h-[60vh] flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
										>
											{messages.map((m, idx) => (
												<Bubble key={idx} message={m} />
											))}
											{waiting && <Thinking />}
										</div>
									)}

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
											className="flex flex-col gap-1.5"
										>
											<div className="flex items-end gap-2">
												{/* Rośnie z treścią: dwie linie na start, do ośmiu, potem przewijanie. Enter wysyła, Shift+Enter łamie linię. */}
												<AutoGrowTextarea
													inputRef={inputRef}
													value={value}
													onChange={(e) => onType(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === 'Enter' && !e.shiftKey) {
															e.preventDefault();
															ask(value);
														}
													}}
													minRows={2}
													maxRows={8}
													maxLength={MAX_CHAT_MSG_LEN}
													placeholder={t('assistant_placeholder')}
													disabled={waiting}
													className="flex-1 rounded-[var(--radius-ui)] border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-ring"
												/>
												<Button
													type="submit"
													variant="accent"
													size="icon"
													disabled={waiting || busyElsewhere || !value.trim()}
													aria-label={t('sent')}
												>
													<Send size={16} aria-hidden="true" />
												</Button>
											</div>
											{busyElsewhere && <p className="text-xs text-muted">{t('assistant_busy_elsewhere')}</p>}
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
