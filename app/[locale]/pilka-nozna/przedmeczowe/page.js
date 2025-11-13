'use client';

import axios from 'axios';
import { useState, useEffect, useContext } from 'react';
import NavBar from '@/components/NavBar';
import ChatComponent from '@/components/ChatComponent';
import { UserContext } from '@/context/UserContext';
import { GiPlayButton } from 'react-icons/gi';
import { FaChartBar } from 'react-icons/fa';
import { FaTable } from 'react-icons/fa';
import { FaSearch } from 'react-icons/fa';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import FullScreenModal from '@/components/FullScreenModal';
import BeatLoader from 'react-spinners/BeatLoader';

export default function PrzedmeczowePage() {
  const locale = useLocale();
  const [fixtures, setFixtures] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [teamStats, setTeamStats] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isGameDetailsModalOpen, setIsGameDetailsModalOpen] = useState(false);
  const [isH2HModalOpen, setIsH2HModalOpen] = useState(false);
  const [isTeamStatsModalOpen, setIsTeamStatsModalOpen] = useState(false);
  const [isStandingsModalOpen, setIsStandingsModalOpen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState(null);
  const [selectedH2HTeamIds, setSelectedH2HTeamIds] = useState(null);
  const [selectedStandings, setSelectedStandings] = useState({ leagueId: null, season: '2025' });
  const [selectedTeamStats, setSelectedTeamStats] = useState({ 
    homeTeamId: null, 
    awayTeamId: null,
    homeTeamName: null,
    awayTeamName: null
  });
  const t = useTranslations('common');
  const { user } = useContext(UserContext);
  const username = user?.username;

  // Date selection state
  const getDateOptions = () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 3; i++) {
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

  const handleLanguageChange = () => {
    setActiveChats([]);
  };

  useEffect(() => {
    // Listen for messages from iframe (game details click)
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'OPEN_GAME_DETAILS') {
        setSelectedGameId(event.data.gameId);
        setSelectedTeamIds(event.data.teamIds || null);
        setIsGameDetailsModalOpen(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const loadFixtures = async () => {
      setIsLoadingFixtures(true);
      try {
        const response = await axios.get(`/api/football/fixtures?date=${selectedDate}`);
        setFixtures(response.data.response || []);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Fixtures load error:', e);
        }
        setFixtures([]);
      } finally {
        setIsLoadingFixtures(false);
      }
    };
    loadFixtures();
  }, [selectedDate]);

  const fetchPredictions = async (id) => {
    try {
      const response = await axios.post('/api/football/fetchPredictions', { fixtureId: id });
      return response.data.prediction;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Błąd pobierania predykcji:', error);
      }
      return null;
    }
  };

  const fetchTeamStatistics = async (teamId, leagueId) => {
    try {
      const response = await axios.post('/api/football/fetchTeamStatistics', { teamId, leagueId });
      return response.data;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching team statistics:', error);
      }
      return null;
    }
  };

  const toggleChat = async (id) => {
    if (activeChats.includes(id)) {
      setActiveChats(activeChats.filter((chatId) => chatId !== id));
    } else {
      setActiveChats([...activeChats, id]);

      const fixture = fixtures.find((f) => f.fixture.id === id);
      if (fixture) {
        try {
          const homeStats = await fetchTeamStatistics(fixture.teams.home.id, fixture.league.id);
          const awayStats = await fetchTeamStatistics(fixture.teams.away.id, fixture.league.id);
          const prediction = await fetchPredictions(id);

          setTeamStats((prev) => ({
            ...prev,
            [id]: { homeStats, awayStats, prediction },
          }));
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching team statistics:', error);
          }
        }
      }
    }
  };

  const filteredFixtures = fixtures.filter((fixture) => {
    const leagueName = fixture.league.name.toLowerCase();
    const homeTeam = fixture.teams.home.name.toLowerCase();
    const awayTeam = fixture.teams.away.name.toLowerCase();
    const term = searchTerm.toLowerCase();
    return leagueName.includes(term) || homeTeam.includes(term) || awayTeam.includes(term);
  });

  const groupedFixtures = filteredFixtures.reduce((acc, fixture) => {
    const leagueKey = `${fixture.league.name} (${fixture.league.country})`;
    if (!acc[leagueKey]) acc[leagueKey] = [];
    acc[leagueKey].push(fixture);
    return acc;
  }, {});

  return (
    <>
      <NavBar onLanguageChange={handleLanguageChange} />

      <div className="content-league">
        <h1 className='h1-football'>
          <img src="/img/football.png" className="icon-sport" alt="Football" />
          {t('footbal')}
        </h1>

        <div className="choose-time" style={{ marginBottom: '20px'}}>
          <Link href="/pilka-nozna/przedmeczowe" className="pre-match-p active-section">
            {t('match')}
          </Link>
          <Link href="/pilka-nozna/live" className="pre-match-p">
            {t('onlive')}
          </Link>
          <button
            onClick={() => setIsResultsModalOpen(true)}
            className="pre-match-p"
            style={{
              background: 'none',
              border: 'none',
              textTransform: 'uppercase'
            }}
          >
            {t('results')}
          </button>
        </div>

        {/* Date selector bar */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          padding: '10px',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '300px'
        }}>
          {getDateOptions().map((dateOption, index) => (
            <button
              key={dateOption.formatted}
              onClick={() => setSelectedDate(dateOption.formatted)}
              style={{
                padding: '10px 20px',
                border: selectedDate === dateOption.formatted ? '2px solid #173b45' : '2px solid transparent',
                background: selectedDate === dateOption.formatted ? '#173b45' : '#f1f1f1',
                color: selectedDate === dateOption.formatted ? '#fff' : '#333',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'Roboto Condensed, sans-serif',
                fontSize: '14px',
                fontWeight: selectedDate === dateOption.formatted ? '700' : '400',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                minWidth: '80px'
              }}
              onMouseEnter={(e) => {
                if (selectedDate !== dateOption.formatted) {
                  e.currentTarget.style.background = '#e0e0e0';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedDate !== dateOption.formatted) {
                  e.currentTarget.style.background = '#f1f1f1';
                }
              }}
            >
              {dateOption.display}
            </button>
          ))}
        </div>

        <div className="search-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FaSearch size={20} style={{ color: '#000', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t('searcha')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{ flex: 1 }}
          />
        </div>

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
              color="#173b45" 
              size={15}
              margin={5}
              speedMultiplier={0.8}
            />
            <p style={{ 
              fontFamily: 'Roboto Condensed, sans-serif',
              color: '#173b45',
              fontSize: '16px',
              fontWeight: 400
            }}>{t('loading')}</p>
          </div>
        )}

        {!isLoadingFixtures && Object.keys(groupedFixtures).length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: '#666',
            fontFamily: 'Roboto Condensed, sans-serif',
            fontSize: '16px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginTop: '20px'
          }}>
            {t('no_matches')}
          </div>
        )}

        {!isLoadingFixtures && Object.keys(groupedFixtures).length > 0 &&
          Object.keys(groupedFixtures).map((leagueKey, leagueIndex) => {
            // Get league info from first fixture in the group
            const firstFixture = groupedFixtures[leagueKey][0];
            const leagueId = firstFixture?.league?.id;
            const season = firstFixture?.league?.season || '2025';
            
            return (
            <div key={leagueIndex} style={{ marginTop: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <h2 className="league-header" style={{ margin: 0 }}>{leagueKey}</h2>
                {leagueId && (
                  <button
                    onClick={() => {
                      setSelectedStandings({ leagueId, season });
                      setIsStandingsModalOpen(true);
                    }}
                    style={{
                      background: '#22c55e',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease',
                    }}
                    className="widget-button"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#16a34a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#22c55e';
                    }}
                    title="League Standings"
                  >
                    <FaTable size={16} />
                  </button>
                )}
              </div>
              {groupedFixtures[leagueKey].map((fixture) => (
                <div key={fixture.fixture.id} className="chat-content">
                  <div className="match-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div onClick={() => toggleChat(fixture.fixture.id)} style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                      <GiPlayButton style={{ marginRight: '10px', color: '#22c55e' }} />
                      <p>
                        {fixture.teams.home.name} - {fixture.teams.away.name}
                        <br />
                        <span>{new Date(fixture.fixture.date).toLocaleString()}</span>
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const homeId = fixture.teams?.home?.id;
                          const awayId = fixture.teams?.away?.id;
                          if (homeId && awayId) {
                            const teamIds = `${homeId}-${awayId}`;
                            setSelectedH2HTeamIds(teamIds);
                            setIsH2HModalOpen(true);
                          } else {
                            if (process.env.NODE_ENV === 'development') {
                              console.error('H2H: Missing team IDs', { homeId, awayId, fixture });
                            }
                          }
                        }}
                        style={{
                          background: '#22c55e',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease',
                        }}
                        className="widget-button"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#16a34a';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#22c55e';
                        }}
                        title="Head to Head"
                      >
                        H2H
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const homeId = fixture.teams?.home?.id;
                          const awayId = fixture.teams?.away?.id;
                          const homeName = fixture.teams?.home?.name || 'Home Team';
                          const awayName = fixture.teams?.away?.name || 'Away Team';
                          if (homeId && awayId) {
                            setSelectedTeamStats({ 
                              homeTeamId: homeId, 
                              awayTeamId: awayId,
                              homeTeamName: homeName,
                              awayTeamName: awayName
                            });
                            setIsTeamStatsModalOpen(true);
                          } else {
                            if (process.env.NODE_ENV === 'development') {
                              console.error('Team Stats: Missing team IDs', { homeId, awayId, fixture });
                            }
                          }
                        }}
                        style={{
                          background: '#22c55e',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          borderRadius: '4px',
                          transition: 'all 0.2s ease',
                        }}
                        className="widget-button"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#16a34a';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#22c55e';
                        }}
                        title="Team Statistics"
                      >
                        <FaChartBar size={16} />
                      </button>
                    </div>
                  </div>

                  {activeChats.includes(fixture.fixture.id) && (
                    <div className="chat-public">
                      <ChatComponent
                        chatId={`Liga-${fixture.fixture.id}`}
                        homeTeam={fixture.teams.home.name}
                        awayTeam={fixture.teams.away.name}
                        homeStats={teamStats[fixture.fixture.id]?.homeStats || {}}
                        awayStats={teamStats[fixture.fixture.id]?.awayStats || {}}
                        isAnalysisEnabled={true}
                        isLive={false}
                        prediction={teamStats[fixture.fixture.id]?.prediction || 'Brak przewidywań'}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            );
          })}
      </div>
      {isResultsModalOpen && (
        <FullScreenModal
          onClose={() => setIsResultsModalOpen(false)}
          src={`/api-sports-football-widget.html?locale=${locale}`}
        />
      )}
      {isGameDetailsModalOpen && selectedGameId && (
        <FullScreenModal
          onClose={() => {
            setIsGameDetailsModalOpen(false);
            setSelectedGameId(null);
            setSelectedTeamIds(null);
          }}
          src={`/api-sports-football-game-details.html?gameId=${selectedGameId}${selectedTeamIds ? `&teamIds=${selectedTeamIds}` : ''}&locale=${locale}`}
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

