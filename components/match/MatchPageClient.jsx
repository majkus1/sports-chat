'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import BackLink from '@/components/layout/BackLink';
import { Link } from '@/i18n/routing';
import AppShell from '@/components/layout/AppShell';
import MatchHeader from '@/components/match/MatchHeader';
import FavoriteButton from '@/components/match/FavoriteButton';
import MatchDataTabs from '@/components/match/MatchDataTabs';
import ChatPanel from '@/components/chat/ChatPanel';
import { useAnalysisStream } from '@/components/match/useAnalysisStream';
import { shouldRefresh } from '@/lib/football/refreshPolicy';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

/** Co ile sprawdzamy, czy jest się po co odzywać do serwera. */
const TICK_MS = 60_000;

/**
 * Pokój meczowy.
 *
 * Dotąd czat rozwijał się w wierszu listy meczów, a statystyki, H2H i tabela otwierały się
 * w osobnych oknach z widgetami zewnętrznego dostawcy. Tutaj wszystko jest na jednym
 * ekranie: dane po lewej, rozmowa po prawej — na wąskim ekranie jako dwie zakładki.
 */
export default function MatchPageClient({ params }) {
	const { fixtureId } = use(params);
	const t = useTranslations('common');
	const locale = useLocale();

	const [bundle, setBundle] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const language = locale === 'pl' ? 'pl' : 'en';
	const { analysis, isGenerating, isPartial, stage, start, setExisting } = useAnalysisStream({
		fixtureId,
		language,
		unavailableText: t('analysis_unavailable'),
	});

	const loadBundle = useCallback(async () => {
		try {
			const res = await fetch(`/api/football/fixture/${fixtureId}/bundle`);
			if (!res.ok) throw new Error('bundle');
			setBundle(await res.json());
			setError(null);
		} catch {
			setError(t('match_not_found'));
		} finally {
			setIsLoading(false);
		}
	}, [fixtureId, t]);

	useEffect(() => {
		loadBundle();
	}, [loadBundle]);

	/*
	 * Ticker chodzi przez cały czas, ale odzywa się do serwera dopiero, gdy jest po co:
	 * blisko gwizdka albo w trakcie meczu. Dzięki temu strona otwarta na godziny przed
	 * meczem sama przechodzi w tryb live, zamiast pokazywać godzinę rozpoczęcia
	 * długo po tym, jak mecz się zaczął.
	 */
	useEffect(() => {
		const fixture = bundle?.fixture;
		if (!fixture) return undefined;

		const id = setInterval(() => {
			if (shouldRefresh(fixture)) loadBundle();
		}, TICK_MS);
		return () => clearInterval(id);
	}, [bundle?.fixture, loadBundle]);

	// Zapisana analiza, jeśli istnieje — bez zużywania limitu.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/football/checkAnalysis', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ fixtureId, language }),
				});
				const data = await res.json();
				if (cancelled || !data.exists) return;

				// Wyczerpany limit oglądania cudzych analiz — pokazujemy zachętę zamiast treści.
				if (data.viewLimitExceeded) {
					setExisting({
						text: t('analysis_view_limit', { limit: data.viewLimit }),
						sections: null,
						limitReached: true,
					});
					return;
				}

				setExisting({
					text: data.analysis || '',
					sections: data.sections || null,
					meta: {
						generatedAt: data.generatedAt || null,
						generatedByName: data.generatedByName || null,
						isOwn: Boolean(data.isOwn),
					},
				});
			} catch {
				/* brak zapisanej analizy nie jest błędem */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [fixtureId, language, setExisting]);

	const chatId = `Liga-${fixtureId}`;

	if (isLoading) {
		return (
			<AppShell contentClassName="mx-auto w-full max-w-6xl">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="mt-4 h-80 w-full" />
			</AppShell>
		);
	}

	if (error || !bundle) {
		return (
			<AppShell contentClassName="mx-auto w-full max-w-6xl">
				<p className="py-10 text-center text-muted">{error || t('match_not_found')}</p>
				<div className="text-center">
					<Button asChild variant="outline">
						<Link href="/pilka-nozna/przedmeczowe">{t('match_room_back')}</Link>
					</Button>
				</div>
			</AppShell>
		);
	}

	const analysisButton = analysis.limitReached ? (
		/* `gap`, nie `space-y` — margines na dzieciach kasuje globalne `* { margin: 0 }`. */
		<div className="flex flex-col items-center gap-4 py-2">
			<p className="max-w-sm text-sm leading-relaxed text-loss">{analysis.text}</p>
			<Button asChild variant="accent" size="lg" className="rounded-full px-6">
				<Link href="/cennik">{t('see_plans')}</Link>
			</Button>
		</div>
	) : (
		<Button
			variant="accent"
			size="lg"
			onClick={() => start()}
			disabled={isGenerating}
			className="rounded-full px-7 text-base shadow-[var(--shadow-soft)]"
		>
			{isGenerating ? (
				<Loader2 size={18} aria-hidden="true" className="motion-safe:animate-spin" />
			) : (
				<Sparkles size={18} aria-hidden="true" />
			)}
			{/* Etap pracy zamiast jednego „proszę czekać" — zebranie danych z API trwa
			    zauważalnie długo, zanim model w ogóle zacznie pisać. */}
			{isGenerating
				? stage === 'generating'
					? t('analysis_writing')
					: t('analysis_preparing')
				: t('generate_analysis')}
		</Button>
	);

	/*
	 * W trwającym meczu analiza starzeje się na oczach użytkownika — ta sprzed gwizdka
	 * opisuje zupełnie inną sytuację niż 60. minuta. Stąd osobny przycisk odświeżenia,
	 * widoczny tylko na żywo. Wymuszenie pomija zapisaną wersję, ale zużywa limit jak
	 * każde generowanie, więc nie jest obejściem planu.
	 */
	const refreshAnalysisButton = bundle.fixture.status.isLive ? (
		<Button
			variant="outline"
			size="sm"
			onClick={() => start({ force: true })}
			disabled={isGenerating}
			// Kompaktowo, bo stoi w nagłówku obok plakietki jakości danych.
			className="h-7 rounded-full px-2.5 text-xs"
		>
			<RefreshCw
				size={14}
				aria-hidden="true"
				className={isGenerating ? 'motion-safe:animate-spin' : undefined}
			/>
			{t('analysis_refresh')}
		</Button>
	) : null;

	// Przy wyczerpanym limicie komunikat i odnośnik do planów idą do slotu, a nie do panelu
	// analizy — inaczej treść błędu wyświetliłaby się jako „analiza".
	const dataPanel = (
		<MatchDataTabs
			bundle={bundle}
			analysis={analysis.limitReached ? null : analysis}
			analysisSlot={analysisButton}
			analysisAction={refreshAnalysisButton}
			isPartial={isPartial}
		/>
	);
	const chatPanel = (
		<ChatPanel
			chatId={chatId}
			className="h-[70vh] rounded-[var(--radius-ui)] border border-border lg:h-full"
		/>
	);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-6xl">
			<BackLink href="/pilka-nozna/przedmeczowe" label={t('match_room_back')} />

			<MatchHeader
				fixture={bundle.fixture}
				action={<FavoriteButton fixtureId={fixtureId} />}
			/>

			{/* Od `lg` dwie kolumny obok siebie; niżej te same panele jako zakładki,
			    bo na telefonie czat i dane nie zmieszczą się jednocześnie. */}
			<div className="mt-6 hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
				<div className="min-w-0">{dataPanel}</div>
				<div className="h-[calc(100vh-16rem)] min-h-[26rem]">{chatPanel}</div>
			</div>

			<Tabs defaultValue="chat" className="mt-6 lg:hidden">
				<TabsList className="w-full">
					<TabsTrigger value="chat" className="flex-1">
						{t('match_room_chat')}
					</TabsTrigger>
					<TabsTrigger value="data" className="flex-1">
						{t('analysis_title')}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="chat">{chatPanel}</TabsContent>
				<TabsContent value="data">{dataPanel}</TabsContent>
			</Tabs>
		</AppShell>
	);
}
