import { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '@/context/UserContext';
import { useSocket } from '@/context/SocketContext';
import Modal from './Modal';
import PrivateChatComponent from './PrivateChatComponent';
import { useTranslations } from 'next-intl'

export default function UserPanel() {
  const [isPrivateChatOpen, setPrivateChatOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const t = useTranslations('common');

  const { user, isAuthed, refreshUser } = useContext(UserContext);
  const { socket, isConnected } = useSocket();
  const username = user?.username;

  const fetchWithRefresh = useCallback(async (url, opts = {}) => {
    const res = await fetch(url, { credentials: 'include', ...opts });
    if (res.status !== 401) return res;

    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return res;

    return fetch(url, { credentials: 'include', ...opts });
  }, []);

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

  const fetchChatHistory = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetchWithRefresh(`/api/getChatHistory?username=${encodeURIComponent(username)}`);
      if (!res.ok) return;
      const data = await res.json();
      setChatHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Błąd podczas pobierania historii czatów:', e);
      }
    }
  }, [username, fetchWithRefresh]);

  useEffect(() => {
    if (isAuthed) {
      refreshUser?.();
      fetchChatHistory();
    }
  }, [isAuthed, refreshUser, fetchChatHistory]);

  useEffect(() => {
    if (!isAuthed || !socket || !isConnected) return;

    const onReceive = (message) => {
      if (message?.receiver === username) fetchChatHistory();
    };
    socket.on('receive_message', onReceive);
    socket.on('receive_private_message', onReceive);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('receive_private_message', onReceive);
    };
  }, [isAuthed, username, fetchChatHistory, socket, isConnected]);

  const openPrivateChat = (chatUsername) => {
    if (!chatUsername || chatUsername === username) return;
    setSelectedUser(chatUsername);
    setPrivateChatOpen(true);
  };

  const closeModal = () => {
    setPrivateChatOpen(false);
    setSelectedUser(null);
    fetchChatHistory();
  };

  if (!isAuthed) return null;

  return (
    <div>
      {isPrivateChatOpen && (
        <Modal onClose={closeModal}>
          <PrivateChatComponent receiver={selectedUser} />
        </Modal>
      )}

      <div className="history-chat">
        <h2>{t('privc')}</h2>
        <ul>
          {chatHistory.map((chat) => (
            <li key={chat.username}>
              <span onClick={() => openPrivateChat(chat.username)} style={{ cursor: 'pointer' }}>
                {chat.username}{' '}
                {chat.lastMessageDate && (
                  <span>
                    (
                    {new Date(chat.lastMessageDate).toLocaleDateString() === new Date().toLocaleDateString()
                      ? t('today') || 'dziś'
                      : new Date(chat.lastMessageDate).toLocaleDateString([], {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        }) + ' '}
                    {new Date(chat.lastMessageDate).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    )
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="box-search">
        <input
          type="text"
          placeholder={t('usersea')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button onClick={() => handleSearch(searchQuery)} className="search-btn">
          {t('searc')}
        </button>
        <ul>
          {searchResults.map((u) => (
            <li key={u.username} onClick={() => openPrivateChat(u.username)} style={{ cursor: 'pointer' }}>
              {u.username}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
