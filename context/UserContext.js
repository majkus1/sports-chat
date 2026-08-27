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
import { ACCESS_REFRESH_INTERVAL_MS } from '@/lib/authConstants';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);
  /** Jedna sesja „/me (+ ewentualnie refresh)” naraz */
  const refreshInflightRef = useRef(null);
  const tabHiddenAtRef = useRef(null);

  const refreshUser = useCallback(async () => {
    if (refreshInflightRef.current) {
      return refreshInflightRef.current;
    }

    const run = (async () => {
      try {
        /** Najpierw /me — świeży access z logowania (np. Google) działa od razu; unikasz zbędnego POST /refresh i 401 w konsoli. */
        let res = await fetch('/api/auth/me', { credentials: 'include' });

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setIsAuthed(true);
          return true;
        }

        if (res.status !== 401) {
          setUser(null);
          setIsAuthed(false);
          return false;
        }

        const r = await refreshAccessToken();
        if (!r.ok) {
          setUser(null);
          setIsAuthed(false);
          return false;
        }

        res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.status === 401) {
          setUser(null);
          setIsAuthed(false);
          return false;
        }

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setIsAuthed(true);
          // Bez przeładowania strony: refreshAccessToken() wyemitował już ACCESS_REFRESH_EVENT,
          // więc socket sam zrobi nowy handshake ze świeżym tokenem.
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

  /** Po >60 s w tle odśwież sesję (wygasły access bez pełnego reloadu) */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible' || tabHiddenAtRef.current == null) {
        return;
      }
      const delta = Date.now() - tabHiddenAtRef.current;
      tabHiddenAtRef.current = null;
      if (delta > 60_000) {
        refreshUser();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshUser]);

  /**
   * Cichy refresh zanim access token wygaśnie.
   *
   * Sedno zgłoszenia „jestem zalogowany, ale nie mogę pisać”: refresh token żyje 30 dni,
   * więc UI cały czas pokazuje zalogowanego, ale ciasteczko access znikało po kilkunastu
   * minutach. Socket czyta je wyłącznie przy handshake, więc po każdym reconnekcie
   * (uśpiony laptop, zmiana sieci, restart nginx) łączył się jako anonim i wiadomości
   * przepadały. Odnowienie z zapasem sprawia, że handshake zawsze ma ważny token.
   */
  useEffect(() => {
    if (!isAuthed) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      refreshAccessToken().catch(() => {});
    }, ACCESS_REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isAuthed]);

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
