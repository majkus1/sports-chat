'use client';

import axios from 'axios';
import BallIcon from '@/components/icons/BallIcon';
import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import { FaSearch } from 'react-icons/fa';
import { useTranslations, useLocale } from 'next-intl';
import FixtureRow from '@/components/football/FixtureRow';
import LeagueHeading from '@/components/football/LeagueHeading';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import Pagination from '@/components/ui/Pagination';
import ModelPicksPanel from '@/components/football/ModelPicksPanel';
import { Link } from '@/i18n/routing';
import BeatLoader from 'react-spinners/BeatLoader';

export default function PrematchClient() {
  const locale = useLocale();
  const [fixtures, setFixtures] = useState([]);
  /*
   * Podpowiedzi modelu przychodzą osobnym żądaniem, po liście — żeby lista nie czekała na
   * rachunek. Mapa `fixtureId → podpowiedź`; brak wpisu = model nie ma nic do powiedzenia.
   */
  const [modelHints, setModelHints] = useState({});
  const [modelTop, setModelTop] = useState({ picks: [], count: 0, full: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isH2HModalOpen, setIsH2HModalOpen] = useState(false);
  const [isTeamStatsModalOpen, setIsTeamStatsModalOpen] = useState(false);
  const [isStandingsModalOpen, setIsStandingsModalOpen] = useState(false);
  const [selectedH2HTeamIds, setSelectedH2HTeamIds] = useState(null);
  const { gameId: detailsGameId, close: closeGameDetails } = useGameDetailsModal();
  const [selectedStandings, setSelectedStandings] = useState({ leagueId: null, season: '2025' });
  const [selectedTeamStats, setSelectedTeamStats] = useState({ 
    homeTeamId: null, 
    awayTeamId: null,
    homeTeamName: null,
    awayTeamName: null
  });
  const t = useTranslations('common');

  // Wybór dnia: dziś + 4 kolejne. Kursy i prognozy dostawca publikuje do ~2 tygodni
  // przed meczem, więc 5 dni to bezpieczny zakres z pełnymi danymi.
  const getDateOptions = () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        date: date,
        formatted: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
        display: i === 0 ? t('today') || 'Dziś' : `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`,
        isToday: i === 0
      });
    }
    return dates;
  };

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  });
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(false);

  // Stronicowanie liczy serwer — tu trzymamy tylko bieżącą stronę i metadane z odpowiedzi.
  const [currentPage, setCurrentPage] = useState(1);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1, pageSize: 50 });

  /*
   * Wyszukiwanie idzie do serwera, więc nie może strzelać przy każdej literze.
   * Odbijamy wpisywanie o 400 ms i dopiero ustabilizowaną frazę wysyłamy w zapytaniu.
   */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Zmiana dnia albo frazy zaczyna od pierwszej strony.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch]);

  // Auto-update selected date at midnight
  useEffect(() => {
    const updateDateAtMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      const timeoutId = setTimeout(() => {
        const today = new Date();
        const newDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
        setSelectedDate(newDate);
        
        // Set up next midnight update
        updateDateAtMidnight();
      }, msUntilMidnight);
      
      return () => clearTimeout(timeoutId);
    };
    
    const cleanup = updateDateAtMidnight();
    return cleanup;
  }, []);


  /*
   * Serwer oddaje gotową stronę: przefiltrowaną (fraza + tylko nierozpoczęte) i przyciętą
   * do 50 pozycji. Wcześniej przeglądarka dostawała cały dzień (~2 MB przy pełnej sobocie)
   * i sama go filtrowała.
   */
  useEffect(() => {
    const loadFixtures = async () => {
      setIsLoadingFixtures(true);
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          page: String(currentPage),
          upcoming: '1',
        });
        if (debouncedSearch) params.set('search', debouncedSearch);

        const response = await axios.get(`/api/football/fixtures?${params.toString()}`);
        setFixtures(response.data.response || []);
        setPaging(response.data.paging || { total: 0, totalPages: 1 });
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Fixtures load error:', e);
        }
        setFixtures([]);
        setPaging({ total: 0, totalPages: 1 });
      } finally {
        setIsLoadingFixtures(false);
      }
    };
    loadFixtures();
  }, [selectedDate, currentPage, debouncedSearch]);

  // Plakietki modelu dla całego dnia — jedno żądanie na datę, niezależne od strony i frazy.
  useEffect(() => {
    let cancelled = false;
    setModelHints({});
    setModelTop({ picks: [], count: 0, full: false });
    axios
      .get(`/api/football/model-hints?date=${selectedDate}`)
      .then((response) => {
        if (cancelled) return;
        setModelHints(response.data?.hints || {});
        setModelTop({
          picks: response.data?.top || [],
          count: response.data?.count || 0,
          full: Boolean(response.data?.full),
        });
      })
      .catch(() => {
        /* lista działa bez plakietek — brak podpowiedzi to nie błąd */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const totalPages = paging.totalPages;

  // Group fixtures by league
  const groupedFixtures = fixtures.reduce((acc, fixture) => {
    const leagueKey = `${fixture.league.name} (${fixture.league.country})`;
    if (!acc[leagueKey]) acc[leagueKey] = [];
    acc[leagueKey].push(fixture);
    return acc;
  }, {});

  return (
    <>
      <NavBar />

      <div className="content-league content-league--wide">
        <h1 className='h1-football'>
          <BallIcon className="icon-sport" />
          {t('footbal')}
        </h1>

        <FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

        {/* Wybór dnia — ten sam segmented control co zakładki w pokoju meczowym,
            żeby przełączniki w całej aplikacji wyglądały tak samo. */}
        <div className="mb-4 inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-2 p-1">
          {getDateOptions().map((dateOption) => {
            const isSelected = selectedDate === dateOption.formatted;
            return (
              <button
                key={dateOption.formatted}
                type="button"
                onClick={() => setSelectedDate(dateOption.formatted)}
                aria-pressed={isSelected}
                className={`inline-flex whitespace-nowrap rounded-full border-0 px-3.5 py-1.5 text-[13px] font-semibold uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isSelected
                    ? 'bg-brand text-brand-fg shadow-sm'
                    : 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
                }`}
              >
                {dateOption.display}
              </button>
            );
          })}
        </div>

        <div className="search-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FaSearch size={20} style={{ color: 'var(--text)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t('searcha')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{ flex: 1 }}
          />
        </div>

        {/*
          * Siatka: na telefonie panel „Model widzi" leży nad listą (kolejność w DOM),
          * na szerokim ekranie idzie do prawej kolumny i zostaje w widoku przy przewijaniu.
          */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
        <ModelPicksPanel
          picks={modelTop.picks}
          count={modelTop.count}
          full={modelTop.full}
          dateLabel={getDateOptions().find((d) => d.formatted === selectedDate)?.display || selectedDate}
          locale={locale}
          className="mb-4 mt-4 lg:sticky lg:top-28 lg:col-start-2 lg:row-start-1 lg:mb-0 lg:mt-0"
        />
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">

        {isLoadingFixtures && (
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            padding: '60px 20px',
            marginTop: '20px'
          }}>
            <BeatLoader 
              color="var(--brand)" 
              size={15}
              margin={5}
              speedMultiplier={0.8}
            />
            <p style={{ 
              fontFamily: 'Roboto Condensed, sans-serif',
              color: 'var(--brand)',
              fontSize: '16px',
              fontWeight: 400
            }}>{t('loading')}</p>
          </div>
        )}

        {/*
          * Pusta lista ma dwa różne powody i dwa różne komunikaty.
          *
          * Wieczorem „dziś" jest puste NIE dlatego, że nic nie grało, tylko dlatego, że
          * wszystko już się zaczęło — lista przedmeczowa pokazuje wyłącznie mecze przed
          * pierwszym gwizdkiem, a doba liczy się po polsku (wcześniej o tej porze stały tu
          * mecze z jutra o 0:30, bo dzień kończył się w UTC). Komunikat „brak meczów dla
          * wybranej daty" był wtedy nieprawdą i zostawiał człowieka bez drogi dalej.
          * Stąd osobna wersja z przyciskiem na jutro i odnośnikiem do meczów na żywo.
          */}
        {!isLoadingFixtures && Object.keys(groupedFixtures).length === 0 && (
          <div className="mt-5 rounded-[var(--radius-ui)] bg-surface px-6 py-10 text-center shadow-[var(--shadow-soft)]">
            {selectedDate === getDateOptions()[0].formatted && !debouncedSearch ? (
              <>
                <p className="text-base font-semibold text-text">{t('no_matches_today_started')}</p>
                <p className="mt-1.5 text-sm text-muted">{t('no_matches_today_hint')}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(getDateOptions()[1].formatted);
                      setCurrentPage(1);
                    }}
                    className="rounded-full border-0 bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    {t('no_matches_see_tomorrow', { date: getDateOptions()[1].display })}
                  </button>
                  <Link
                    href="/pilka-nozna/live"
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-text no-underline transition-colors hover:border-accent"
                  >
                    {t('onlive')}
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-base text-muted">{t('no_matches')}</p>
            )}
          </div>
        )}

        {!isLoadingFixtures && Object.keys(groupedFixtures).length > 0 &&
          Object.keys(groupedFixtures).map((leagueKey, leagueIndex) => {
            // Get league info from first fixture in the group
            const firstFixture = groupedFixtures[leagueKey][0];
            const leagueId = firstFixture?.league?.id;
            const season = firstFixture?.league?.season || '2025';

            return (
            <div key={leagueIndex}>
              <LeagueHeading
                name={leagueKey}
                leagueId={leagueId}
                onStandings={() => {
                  setSelectedStandings({ leagueId, season });
                  setIsStandingsModalOpen(true);
                }}
              />
              {groupedFixtures[leagueKey].map((fixture) => (
                <FixtureRow
                  key={fixture.fixture.id}
                  fixture={fixture}
                  locale={locale}
                  modelHint={modelHints[String(fixture.fixture.id)] || null}
                  onH2H={(f) => {
                    setSelectedH2HTeamIds(`${f.teams.home.id}-${f.teams.away.id}`);
                    setIsH2HModalOpen(true);
                  }}
                  onTeamStats={(f) => {
                    setSelectedTeamStats({
                      homeTeamId: f.teams.home.id,
                      awayTeamId: f.teams.away.id,
                      homeTeamName: f.teams.home.name,
                      awayTeamName: f.teams.away.name,
                    });
                    setIsTeamStatsModalOpen(true);
                  }}
                />
              ))}
            </div>
            );
          })}

        {!isLoadingFixtures && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={paging.total}
            pageSize={paging.pageSize}
            onChange={(n) => {
              setCurrentPage(n);
              // Przycisk jest pod listą — bez tego nowa strona otwiera się od dołu.
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mb-8 mt-5"
          />
        )}
        </div>
        </div>
      </div>

      {/* Ta strona nie przechodzi jeszcze przez AppShell, więc stopkę dokładamy tutaj —
          klauzula o odpowiedzialnej grze ma być widoczna także przy liście meczów. */}
      <Footer className="mx-5" />

      {isResultsModalOpen && (
        <FullScreenModal
          onClose={() => setIsResultsModalOpen(false)}
          src={`/api/widgets/games?locale=${locale}`}
        />
      )}
      {detailsGameId && (
        <FullScreenModal
          onClose={closeGameDetails}
          src={`/api/widgets/game?gameId=${detailsGameId}&locale=${locale}`}
        />
      )}
      {isH2HModalOpen && selectedH2HTeamIds && (
        <FullScreenModal
          onClose={() => {
            setIsH2HModalOpen(false);
            setSelectedH2HTeamIds(null);
          }}
          src={`/api/football-h2h?teamIds=${selectedH2HTeamIds}&locale=${locale}`}
        />
      )}
      {isTeamStatsModalOpen && selectedTeamStats.homeTeamId && selectedTeamStats.awayTeamId && (
        <FullScreenModal
          onClose={() => {
            setIsTeamStatsModalOpen(false);
            setSelectedTeamStats({ homeTeamId: null, awayTeamId: null, homeTeamName: null, awayTeamName: null });
          }}
          src={`/api/football-team-stats?homeTeamId=${selectedTeamStats.homeTeamId}&awayTeamId=${selectedTeamStats.awayTeamId}${selectedTeamStats.homeTeamName ? `&homeTeamName=${encodeURIComponent(selectedTeamStats.homeTeamName)}` : ''}${selectedTeamStats.awayTeamName ? `&awayTeamName=${encodeURIComponent(selectedTeamStats.awayTeamName)}` : ''}&locale=${locale}`}
        />
      )}
      {isStandingsModalOpen && selectedStandings.leagueId && (
        <FullScreenModal
          onClose={() => {
            setIsStandingsModalOpen(false);
            setSelectedStandings({ leagueId: null, season: '2025' });
          }}
          src={`/api/football-standings?leagueId=${selectedStandings.leagueId}&season=${selectedStandings.season}&locale=${locale}`}
        />
      )}
    </>
  );
}

