'use client';

import { useState, useEffect } from 'react';
import BallIcon from '@/components/icons/BallIcon';
import axios from 'axios';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import { FaSearch } from 'react-icons/fa';
import { useTranslations, useLocale } from 'next-intl';
import FixtureRow from '@/components/football/FixtureRow';
import LeagueHeading from '@/components/football/LeagueHeading';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';

export default function LiveClient() {
  const locale = useLocale();
  const [fixtures, setFixtures] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isTeamStatsModalOpen, setIsTeamStatsModalOpen] = useState(false);
  const [isH2HModalOpen, setIsH2HModalOpen] = useState(false);
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


  useEffect(() => {
    const loadFixtures = async () => {
      try {
        const response = await axios.get('/api/football/fetchLiveFixtures');
        setFixtures(response.data.fixtures);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error loading live fixtures:', error);
        }
      }
    };

    loadFixtures();
  }, []);



  const filteredFixtures = fixtures.filter((fixture) => {
    const leagueName = fixture.league.name.toLowerCase();
    const homeTeam = fixture.teams.home.name.toLowerCase();
    const awayTeam = fixture.teams.away.name.toLowerCase();
    const term = searchTerm.toLowerCase();

    return leagueName.includes(term) || homeTeam.includes(term) || awayTeam.includes(term);
  });

  const groupedFixtures = filteredFixtures.reduce((acc, fixture) => {
    const leagueKey = `${fixture.league.name} (${fixture.league.country})`;
    if (!acc[leagueKey]) {
      acc[leagueKey] = [];
    }
    acc[leagueKey].push(fixture);
    return acc;
  }, {});

  return (
    <>
      <NavBar />
      <div className="content-league">
        <h1 className='h1-football'>
          <BallIcon className="icon-sport" />
          {t('footbal')}
        </h1>
        <FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

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

        {Object.keys(groupedFixtures).length === 0
          ? ''
          : Object.keys(groupedFixtures).map((leagueKey, leagueIndex) => {
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
                    isLive
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
      </div>

      {/* Ta strona nie przechodzi jeszcze przez AppShell, więc stopkę dokładamy tutaj. */}
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
      {isTeamStatsModalOpen && selectedTeamStats.homeTeamId && selectedTeamStats.awayTeamId && (
        <FullScreenModal
          onClose={() => {
            setIsTeamStatsModalOpen(false);
            setSelectedTeamStats({ homeTeamId: null, awayTeamId: null, homeTeamName: null, awayTeamName: null });
          }}
          src={`/api/football-team-stats?homeTeamId=${selectedTeamStats.homeTeamId}&awayTeamId=${selectedTeamStats.awayTeamId}${selectedTeamStats.homeTeamName ? `&homeTeamName=${encodeURIComponent(selectedTeamStats.homeTeamName)}` : ''}${selectedTeamStats.awayTeamName ? `&awayTeamName=${encodeURIComponent(selectedTeamStats.awayTeamName)}` : ''}&locale=${locale}`}
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

