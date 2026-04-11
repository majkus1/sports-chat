'use client';

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { refreshAccessToken } from '@/lib/authFetch';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);
  /** Jedna sesja refresh+me naraz — podwójne mounty (Strict Mode) lub szybkie powtórzenia nie rozjeżdżają rotacji refresh tokena */
  const refreshInflightRef = useRef(null);

  const refreshUser = useCallback(async () => {
    if (refreshInflightRef.current) {
      return refreshInflightRef.current;
    }

    const run = (async () => {
      try {
        const r = await refreshAccessToken();

        if (!r.ok) {
          setUser(null);
          setIsAuthed(false);
          return false;
        }

        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.status === 401) {
          setUser(null);
          setIsAuthed(false);
          return false;
        }

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setIsAuthed(true);
          return true;
        }

        setUser(null);
        setIsAuthed(false);
        return false;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('refreshUser error:', e);
        }
        setUser(null);
        setIsAuthed(false);
        return false;
      } finally {
        refreshInflightRef.current = null;
      }
    })();

    refreshInflightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  /** Powrót z bfcache albo po długiej przerwie — stan React mógł być „zalogowany”, cookies już nie */
  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        refreshUser();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [refreshUser]);

  const ctxValue = useMemo(
    () => ({
      user,
      setUser,
      isAuthed,
      setIsAuthed,
      refreshUser,
    }),
    [user, isAuthed, refreshUser]
  );

  return <UserContext.Provider value={ctxValue}>{children}</UserContext.Provider>;
}
