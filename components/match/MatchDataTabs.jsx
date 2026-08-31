'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Card, CardContent } from '@/components/ui/Card';
import AnalysisPanel from '@/components/match/AnalysisPanel';
import AnalysisChat from '@/components/match/AnalysisChat';
import WidgetFrame from '@/components/match/WidgetFrame';
import CommunityPicks from '@/components/picks/CommunityPicks';

function Empty({ children }) {
	return <p className="px-1 py-6 text-center text-sm text-muted">{children}</p>;
}

function FormRow({ label, home, away }) {
	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5 text-sm">
			<span className="text-right font-semibold tabular-nums text-text">{home ?? '—'}</span>
			<span className="text-center text-xs text-muted">{label}</span>
			<span className="font-semibold tabular-nums text-text">{away ?? '—'}</span>
		</div>
	);
}

function StatsTab({ bundle }) {
	const t = useTranslations('common');
	const home = bundle.form?.home;
	const away = bundle.form?.away;
	if (!home && !away) return <Empty>{t('analysis_unavailable')}</Empty>;

	const rows = [
		{ label: t('played'), home: home?.played?.total, away: away?.played?.total },
		{ label: t('form_label'), home: home?.form, away: away?.form },
		{
			label: t('avg_scored'),
			home: home?.goals?.for?.average?.total,
			away: away?.goals?.for?.average?.total,
		},
		{
			label: t('avg_conceded'),
			home: home?.goals?.against?.average?.total,
			away: away?.goals?.against?.average?.total,
		},
		{ label: t('clean_sheets'), home: home?.cleanSheet?.total, away: away?.cleanSheet?.total },
		{ label: t('failed_to_score'), home: home?.failedToScore?.total, away: away?.failedToScore?.total },
		{ label: t('formation'), home: home?.formation, away: away?.formation },
	];

	return (
		<Card>
			<CardContent className="divide-y divide-border">
				{rows.map((row) => (
					<FormRow key={row.label} {...row} />
				))}
			</CardContent>
		</Card>
	);
}

function H2HTab({ bundle }) {
	const t = useTranslations('common');
	if (!bundle.h2h?.length) return <Empty>{t('no_h2h')}</Empty>;

	return (
		<Card>
			<CardContent className="divide-y divide-border p-0">
				{bundle.h2h.map((match) => (
					<div key={match.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
						<span className="w-20 shrink-0 text-xs text-muted">
							{(match.date || '').slice(0, 10)}
						</span>
						<span className="flex-1 truncate text-right text-text">{match.home.name}</span>
						<span className="shrink-0 font-bold tabular-nums text-text">
							{match.home.goals ?? '—'}:{match.away.goals ?? '—'}
						</span>
						<span className="flex-1 truncate text-text">{match.away.name}</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

/**
 * Ostatnie mecze obu drużyn.
 *
 * Dane (`bundle.recentForm`) pobieraliśmy od dawna — trafiały wyłącznie do promptu analizy,
 * więc żeby zobaczyć ostatnie spotkania, trzeba było o nie zapytać asystenta. Zakładka
 * pokazuje to samo wprost i nie kosztuje ani jednego dodatkowego zapytania do API.
 *
 * Kolejność jak w API: od najnowszego meczu. Ciąg formy w podsumowaniu jest odwrócony
 * (najstarszy z lewej), bo tak czyta się go chronologicznie — i tak podaje go dostawca.
 */
const RESULT_TONE = {
	W: 'bg-win text-white',
	D: 'bg-draw text-white',
	L: 'bg-loss text-white',
};

function ResultBadge({ result }) {
	if (!result) return <span className="h-5 w-5 shrink-0" aria-hidden="true" />;
	return (
		<span
			className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${RESULT_TONE[result] || 'bg-surface-2 text-muted'}`}
		>
			{result}
		</span>
	);
}

function RecentTeam({ teamName, data }) {
	const t = useTranslations('common');
	const locale = useLocale();

	return (
		<Card>
			<CardContent className="p-0">
				<div className="border-b border-border px-4 py-3">
					<h4 className="truncate text-sm font-bold text-text">{teamName}</h4>
					{data?.summary?.played ? (
						<p className="mt-0.5 text-xs text-muted">
							{t('recent_summary', {
								wins: data.summary.wins,
								draws: data.summary.draws,
								loses: data.summary.loses,
							})}
							{' · '}
							{t('recent_goals', {
								scored: data.summary.goalsForAvg,
								conceded: data.summary.goalsAgainstAvg,
							})}
						</p>
					) : null}
				</div>

				{!data?.matches?.length ? (
					<Empty>{t('no_recent')}</Empty>
				) : (
					<ul className="divide-y divide-border">
						{data.matches.map((match) => (
							<li key={match.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
								<ResultBadge result={match.result} />

								<span className="w-14 shrink-0 text-xs tabular-nums text-muted">
									{match.date
										? new Date(match.date).toLocaleDateString(locale, {
												day: '2-digit',
												month: '2-digit',
											})
										: '—'}
								</span>

								{/* Gospodarz czy gość — bez tego wynik 2:1 nic nie mówi o kontekście. */}
								<span
									className="w-4 shrink-0 text-center text-[11px] font-bold text-muted"
									title={match.isHome ? t('recent_home') : t('recent_away')}
								>
									{match.isHome ? t('recent_home_short') : t('recent_away_short')}
								</span>

								<span className="min-w-0 flex-1 truncate text-text" title={match.competition || ''}>
									{match.opponent || '—'}
								</span>

								<span className="shrink-0 font-bold tabular-nums text-text">
									{match.goalsFor ?? '—'}:{match.goalsAgainst ?? '—'}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function RecentFormTab({ bundle }) {
	const t = useTranslations('common');
	const recent = bundle.recentForm;
	if (!recent?.home?.matches?.length && !recent?.away?.matches?.length) {
		return <Empty>{t('no_recent')}</Empty>;
	}

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<RecentTeam teamName={bundle.fixture.teams.home.name} data={recent?.home} />
			<RecentTeam teamName={bundle.fixture.teams.away.name} data={recent?.away} />
		</div>
	);
}

function LineupsTab({ bundle }) {
	const t = useTranslations('common');
	if (!bundle.lineups?.length) return <Empty>{t('no_lineups')}</Empty>;

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{bundle.lineups.map((lineup) => (
				<Card key={lineup.teamId}>
					<CardContent>
						<h4 className="text-sm font-bold text-text">{lineup.teamName}</h4>
						<p className="mb-2 text-xs text-muted">{lineup.formation}</p>
						<ol className="text-sm text-text [&>li+li]:mt-1.5">
							{lineup.startXI.map((player) => (
								<li key={player.id || player.name} className="flex gap-2">
									<span className="w-6 shrink-0 text-right tabular-nums text-muted">
										{player.number ?? ''}
									</span>
									<span className="truncate">{player.name}</span>
								</li>
							))}
						</ol>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function StandingsTab({ bundle, fixture }) {
	const t = useTranslations('common');
	if (!bundle.standings?.length) return <Empty>{t('no_standings')}</Empty>;

	const highlighted = new Set([fixture.teams.home.id, fixture.teams.away.id]);

	return (
		<Card>
			{/* Tabela bywa szersza niż panel — przewija się we własnym kontenerze,
			    żeby nie rozjeżdżać całej strony. */}
			<CardContent className="overflow-x-auto p-0">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border text-xs uppercase text-muted">
							<th className="px-3 py-2 text-left font-semibold">#</th>
							<th className="px-3 py-2 text-left font-semibold">{t('team')}</th>
							<th className="px-2 py-2 text-right font-semibold">M</th>
							<th className="px-2 py-2 text-right font-semibold">+/-</th>
							<th className="px-3 py-2 text-right font-semibold">Pkt</th>
						</tr>
					</thead>
					<tbody>
						{bundle.standings.map((row) => (
							<tr
								key={row.teamId}
								className={highlighted.has(row.teamId) ? 'bg-accent-soft font-semibold' : ''}
							>
								<td className="px-3 py-1.5 tabular-nums text-muted">{row.rank}</td>
								<td className="px-3 py-1.5 text-text">{row.teamName}</td>
								<td className="px-2 py-1.5 text-right tabular-nums text-muted">{row.played}</td>
								<td className="px-2 py-1.5 text-right tabular-nums text-muted">{row.goalsDiff}</td>
								<td className="px-3 py-1.5 text-right font-bold tabular-nums text-text">
									{row.points}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
}

/**
 * Buduje adresy widgetów dla tego meczu.
 *
 * `null` oznacza, że dostawca nie podał identyfikatorów potrzebnych widgetowi — wtedy
 * zakładka pokazuje nasz własny, skromniejszy widok z pakietu zamiast pustej ramki.
 */
function widgetSources(fixture, locale) {
	const homeId = fixture.teams?.home?.id;
	const awayId = fixture.teams?.away?.id;
	const leagueId = fixture.league?.id;
	const season = fixture.league?.season;

	const params = (entries) => new URLSearchParams({ ...entries, locale }).toString();

	return {
		/*
		 * Widget `game` to pełne centrum meczu: wydarzenia, statystyki, składy i zawodnicy.
		 * Dotąd dało się do niego dotrzeć wyłącznie klikając mecz w innym widgecie, który
		 * otwierał własne okno dostawcy. Tutaj jest zwykłą zakładką — w meczu na żywo
		 * to najcenniejsza treść na stronie, więc nie powinna być schowana za oknem.
		 */
		game: fixture.id ? `/api/widgets/game?${params({ gameId: String(fixture.id) })}` : null,
		h2h: homeId && awayId ? `/api/football-h2h?${params({ teamIds: `${homeId}-${awayId}` })}` : null,
		teamStats:
			homeId && awayId
				? `/api/football-team-stats?${params({
						homeTeamId: String(homeId),
						awayTeamId: String(awayId),
						homeTeamName: fixture.teams.home.name || '',
						awayTeamName: fixture.teams.away.name || '',
					})}`
				: null,
		standings:
			leagueId && season
				? `/api/football-standings?${params({ leagueId: String(leagueId), season: String(season) })}`
				: null,
	};
}

/**
 * Zakładki z danymi meczu.
 *
 * Statystyki, H2H i tabela to widgety API-Sports — te same, które wcześniej otwierały się
 * jako osobne pełnoekranowe okna z listy meczów. Tutaj są osadzone w zakładkach, dopasowane
 * do motywu aplikacji i rosnące do wysokości treści, więc nie ma okna w oknie.
 * Składy i analiza pochodzą z naszego pakietu (`/api/football/fixture/[id]/bundle`).
 */
export default function MatchDataTabs({
	bundle,
	analysis,
	analysisSlot,
	analysisAction,
	isPartial = false,
	className,
}) {
	const t = useTranslations('common');
	const locale = useLocale();
	const widgets = widgetSources(bundle.fixture, locale);
	const isLive = bundle.fixture.status?.isLive;

	return (
		/*
		 * W trwającym meczu na wierzchu ląduje przebieg, nie analiza: kto wchodzi w trakcie,
		 * chce najpierw zobaczyć, co się właśnie dzieje. Wartość początkowa działa przy
		 * montowaniu, więc mecz, który rozpocznie się przy otwartej stronie, nie przestawi
		 * zakładki pod palcami czytającego.
		 */
		<Tabs defaultValue={isLive && widgets.game ? 'feed' : 'analysis'} className={className}>
			<TabsList>
				<TabsTrigger value="analysis">{t('analysis_title')}</TabsTrigger>
				{widgets.game && (
					<TabsTrigger value="feed">
						{isLive && (
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 rounded-full bg-live motion-safe:animate-pulse"
							/>
						)}
						{t('match_room_feed')}
					</TabsTrigger>
				)}
				<TabsTrigger value="stats">{t('match_room_stats')}</TabsTrigger>
				{/* Ostatnie mecze przed H2H: częściej pyta się o formę niż o historię par. */}
				<TabsTrigger value="recent">{t('match_room_recent')}</TabsTrigger>
				<TabsTrigger value="h2h">{t('match_room_h2h')}</TabsTrigger>
				<TabsTrigger value="lineups">{t('match_room_lineups')}</TabsTrigger>
				<TabsTrigger value="standings">{t('match_room_standings')}</TabsTrigger>
				<TabsTrigger value="picks">{t('pick_tab')}</TabsTrigger>
			</TabsList>

			{/* Typy społeczności — osobna zakładka, bo to treść tworzona przez ludzi,
			    a nie kolejny widok danych dostawcy. */}
			<TabsContent value="picks">
				<CommunityPicks
					fixtureId={String(bundle.fixture.id)}
					kickoff={bundle.fixture.date}
					isStarted={bundle.fixture.status.isLive || bundle.fixture.status.isFinished}
				/>
			</TabsContent>

			<TabsContent value="analysis">
				{analysis?.sections || analysis?.text ? (
					<>
						<AnalysisPanel
							sections={analysis.sections}
							fallbackText={analysis.text}
							homeTeam={bundle.fixture.teams.home.name}
							awayTeam={bundle.fixture.teams.away.name}
							isPartial={isPartial}
							meta={analysis.meta}
							headerAction={analysisAction}
						/>

						{/* Rozmowa dopiero pod gotową analizą — bez niej asystent nie ma
						    czego doprecyzowywać, a pytanie „o co chodzi" wisiałoby w próżni. */}
						<AnalysisChat
							fixtureId={String(bundle.fixture.id)}
							language={locale === 'pl' ? 'pl' : 'en'}
							className="mt-6"
						/>
					</>
				) : (
					<Card>
						{/* Stan pusty jest tu głównym ekranem zakładki, więc dostaje własną
						    kompozycję zamiast samego zdania z przyciskiem pod spodem. */}
						<CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
							<span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
								<Sparkles size={20} aria-hidden="true" />
							</span>
							<p className="max-w-sm text-sm leading-relaxed text-muted">
								{t('generate_analysis_hint')}
							</p>
							{analysisSlot}
						</CardContent>
					</Card>
				)}
			</TabsContent>

			{/* Zakładki Radix montują tylko aktywną treść, więc widget ładuje się dopiero
			    po kliknięciu — nie startujemy kilku iframe'ów naraz przy wejściu na mecz. */}
			{widgets.game && (
				<TabsContent value="feed">
					<Card>
						<CardContent>
							<WidgetFrame
								src={widgets.game}
								title={t('match_room_feed')}
								minHeight={520}
							/>
						</CardContent>
					</Card>
				</TabsContent>
			)}

			<TabsContent value="stats">
				{widgets.teamStats ? (
					<Card>
						<CardContent>
							<WidgetFrame src={widgets.teamStats} title={t('match_room_stats')} minHeight={420} />
						</CardContent>
					</Card>
				) : (
					<StatsTab bundle={bundle} />
				)}
			</TabsContent>

			<TabsContent value="recent">
				<RecentFormTab bundle={bundle} />
			</TabsContent>

			<TabsContent value="h2h">
				{widgets.h2h ? (
					<Card>
						<CardContent>
							<WidgetFrame src={widgets.h2h} title={t('match_room_h2h')} minHeight={360} />
						</CardContent>
					</Card>
				) : (
					<H2HTab bundle={bundle} />
				)}
			</TabsContent>

			<TabsContent value="lineups">
				<LineupsTab bundle={bundle} />
			</TabsContent>

			<TabsContent value="standings">
				{widgets.standings ? (
					<Card>
						<CardContent>
							<WidgetFrame
								src={widgets.standings}
								title={t('match_room_standings')}
								minHeight={480}
							/>
						</CardContent>
					</Card>
				) : (
					<StandingsTab bundle={bundle} fixture={bundle.fixture} />
				)}
			</TabsContent>
		</Tabs>
	);
}
