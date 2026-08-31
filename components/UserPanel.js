import { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '@/context/UserContext';
import Modal from './Modal';
import PrivateChatComponent from './PrivateChatComponent';
import { useTranslations } from 'next-intl'
import { Bell, BellOff, Gauge, Search, Star, Target, X } from 'lucide-react'
import AccuracyPanel from '@/components/stats/AccuracyPanel'
import PlanSummary from '@/components/billing/PlanSummary'
import { Link } from '@/i18n/routing'
import { fetchWithAuthRefresh } from '@/lib/authFetch'
import { initialsFromName } from '@/components/ui/Avatar'
import { useUnread } from '@/context/UnreadContext'
import { isSoundEnabled, setSoundEnabled } from '@/lib/notificationSound'

/**
 * Przybliżony stan meczu z samej godziny rozpoczęcia — bez odpytywania API o każdy
 * ulubiony wpis. 150 minut pokrywa mecz z przerwą i doliczonym czasem; dokładny status
 * i tak pokaże pokój meczowy po wejściu.
 */
const LIVE_WINDOW_MS = 150 * 60_000;

function favoriteBucket(kickoff, now = Date.now()) {
	const start = Date.parse(kickoff);
	if (!Number.isFinite(start)) return 'upcoming';
	if (start > now) return 'upcoming';
	if (now - start <= LIVE_WINDOW_MS) return 'live';
	return 'finished';
}

export default function UserPanel() {
  const [isPrivateChatOpen, setPrivateChatOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => setSoundOn(isSoundEnabled()), []);
  const [searchResults, setSearchResults] = useState([]);
  const t = useTranslations('common');

  const { user, isAuthed } = useContext(UserContext);
  const username = user?.username;

  const [favorites, setFavorites] = useState([]);

  const fetchFavorites = useCallback(async () => {
    try {
      const res = await fetchWithAuthRefresh('/api/favorites');
      if (!res.ok) return;
      const data = await res.json();
      setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
    } catch {
      /* sekcja ulubionych po prostu zostaje pusta */
    }
  }, []);

  useEffect(() => {
    if (isAuthed) fetchFavorites();
  }, [isAuthed, fetchFavorites]);

  const removeFavorite = async (fixtureId) => {
    // Optymistycznie: wpis znika od razu, wraca tylko przy odmowie serwera.
    const previous = favorites;
    setFavorites(previous.filter((f) => f.fixtureId !== fixtureId));
    try {
      const res = await fetchWithAuthRefresh(`/api/favorites/${encodeURIComponent(fixtureId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) setFavorites(previous);
    } catch {
      setFavorites(previous);
    }
  };

  const fetchWithRefresh = useCallback(
    (url, opts) => fetchWithAuthRefresh(url, opts),
    []
  );

  const handleSearch = useCallback(async (query) => {
    if (!query) return;
    try {
      const res = await fetchWithRefresh(`/api/searchUsers?query=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setSearchResults(data.users || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Error during user search:', e);
      }
    }
  }, [fetchWithRefresh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  /*
   * Lista rozmów i liczniki nieprzeczytanych idą z UnreadContext — ten sam stan zasila
   * plakietkę na ikonie konta w nagłówku, więc panel nie może trzymać własnej kopii.
   */
  const { chats: chatHistory, refresh: fetchChatHistory, markRead, closeChat } = useUnread();

  const openPrivateChat = (chatUsername) => {
    if (!chatUsername || chatUsername === username) return;
    setSelectedUser(chatUsername);
    setPrivateChatOpen(true);
    // Otwarcie rozmowy zeruje jej licznik i wstrzymuje naliczanie na czas czytania.
    markRead(chatUsername, { open: true });
  };

  const closeModal = () => {
    setPrivateChatOpen(false);
    setSelectedUser(null);
    closeChat();
    fetchChatHistory();
  };

  if (!isAuthed) return null;

  /** Skrót daty: dla dzisiejszych rozmów sama godzina — data „dziś" nic nie wnosi. */
  const formatWhen = (value) => {
    const date = new Date(value);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toLocaleDateString() === new Date().toLocaleDateString()) return time;
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`;
  };

  const PersonRow = ({ name, meta, preview, unread = 0, onClick }) => (
    <button type="button" onClick={onClick} className="person-row">
      <span className="person-avatar" aria-hidden="true">
        {initialsFromName(name)}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate ${unread > 0 ? 'font-bold text-text' : 'font-semibold'}`}>
          {name}
        </span>
        {/* Podgląd ostatniej wiadomości — bez niego lista nie mówi, czego dotyczy rozmowa. */}
        {preview && (
          <span className={`block truncate text-xs ${unread > 0 ? 'text-text' : 'text-muted'}`}>
            {preview}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {meta && <span className="text-xs text-muted">{meta}</span>}
        {unread > 0 && (
          <span
            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-live px-1 text-[10px] font-bold leading-none text-white"
            aria-label={t('unread_badge_label', { count: unread })}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </span>
    </button>
  );

  return (
    /*
     * Panel dostaje pełną szerokość rozwijanego menu.
     *
     * Wcześniej wszystko szło jedną kolumną szerokości 384 px, więc na desktopie dwie
     * trzecie ekranu stały puste, a użytkownik przewijał listę sekcji. Teraz treść
     * układa się w dwie kolumny od `lg` w górę.
     */
    <div className="mx-auto w-full max-w-5xl">
      {isPrivateChatOpen && (
        <Modal onClose={closeModal}>
          <PrivateChatComponent receiver={selectedUser} />
        </Modal>
      )}

      <div className="account-card">
        {/* Nagłówek konta: dotąd panel zaczynał się od listy rozmów i nigdzie nie było
            widać, na kogo się właściwie zalogowano. */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <span className="account-avatar" aria-hidden="true">
            {initialsFromName(username)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-text">{username}</p>
            <p className="text-xs text-muted">{t('account_panel')}</p>
          </div>
        </div>

        {/*
         * Dwie kolumny na szerokim ekranie: po lewej skuteczność (najbogatsza treść),
         * po prawej listy — ulubione mecze i rozmowy. Na wąskim wszystko wraca
         * do jednej kolumny, bo siatka ma tylko jeden tor.
         */}
        <div className="mt-4 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        {/*
         * Plan i limity na samej górze lewej kolumny.
         *
         * To jedyne miejsce w aplikacji, gdzie widać termin ważności opłaconego dostępu —
         * a przy płatności jednorazowej za 30 dni jest to informacja, po którą się tu wraca.
         */}
        <section className="lg:col-span-2">
          <h3 className="section-heading flex items-center gap-1.5">
            <Gauge size={14} aria-hidden="true" className="text-accent" />
            {t('plan_and_limits')}
          </h3>
          <PlanSummary className="mt-2" />
        </section>

        {/* Skuteczność moich typów — filtrowana po rodzaju, w wersji kompaktowej. */}
        <section>
          <h3 className="section-heading flex items-center gap-1.5">
            <Target size={14} aria-hidden="true" className="text-accent" />
            {t('accuracy_mine')}
          </h3>
          <AccuracyPanel scope="me" compact className="mt-2" />
        </section>

        {/* Prawa kolumna: ulubione mecze, rozmowy i wyszukiwarka jako jeden blok. */}
        <div className="flex flex-col gap-6">
        {/* Ulubione mecze — pogrupowane po przybliżonym stanie liczonym z godziny startu. */}
        <section>
          <h3 className="section-heading flex items-center gap-1.5">
            <Star size={14} aria-hidden="true" className="text-draw" />
            {t('favorites_title')}
          </h3>

          {favorites.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">{t('favorites_empty')}</p>
          ) : (
            (() => {
              const groups = { live: [], upcoming: [], finished: [] };
              for (const f of favorites) groups[favoriteBucket(f.kickoff)].push(f);
              // Nadchodzące od najbliższego; zakończone od najświeższego.
              groups.upcoming.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

              const order = [
                ['live', t('favorites_live')],
                ['upcoming', t('favorites_upcoming')],
                ['finished', t('favorites_finished')],
              ];

              return order.map(([key, label]) =>
                groups[key].length === 0 ? null : (
                  <div key={key} className="mt-2">
                    <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                      {label}
                      {key === 'live' && (
                        <span
                          aria-hidden="true"
                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live motion-safe:animate-pulse"
                        />
                      )}
                    </p>
                    <div className="mt-0.5 max-h-44 overflow-y-auto">
                      {groups[key].map((f) => (
                        <div key={f.fixtureId} className="flex items-center gap-1">
                          <Link href={`/mecz/${f.fixtureId}`} className="person-row min-w-0 flex-1">
                            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                              {f.homeName} – {f.awayName}
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              {f.kickoff
                                ? new Date(f.kickoff).toLocaleString([], {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeFavorite(f.fixtureId)}
                            aria-label={t('favorite_remove')}
                            className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-loss"
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              );
            })()
          )}
        </section>

        <section className="border-t border-border pt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="section-heading">{t('privc')}</h3>

            {/* Przełącznik dźwięku przy rozmowach, bo tylko ich dotyczy. */}
            <button
              type="button"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
              }}
              aria-pressed={soundOn}
              aria-label={soundOn ? t('sound_off') : t('sound_on')}
              title={soundOn ? t('sound_off') : t('sound_on')}
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              {soundOn ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}
            </button>
          </div>

          {chatHistory.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">{t('no_conversations')}</p>
          ) : (
            <div className="mt-1 max-h-56 overflow-y-auto">
              {chatHistory.map((chat) => (
                <PersonRow
                  key={chat.username}
                  name={chat.username}
                  preview={chat.lastMessagePreview}
                  unread={chat.unreadCount || 0}
                  meta={chat.lastMessageDate ? formatWhen(chat.lastMessageDate) : null}
                  onClick={() => openPrivateChat(chat.username)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-border pt-5">
          <h3 className="section-heading">{t('searc')}</h3>
          <div className="relative mt-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              placeholder={t('usersea')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-field"
            />
          </div>

          {searchQuery && (
            <div className="mt-1 max-h-48 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted">{t('no_users_found')}</p>
              ) : (
                searchResults.map((u) => (
                  <PersonRow
                    key={u.username}
                    name={u.username}
                    onClick={() => openPrivateChat(u.username)}
                  />
                ))
              )}
            </div>
          )}
        </section>
        </div>
        </div>
      </div>
    </div>
  );
}
