'use client';

import { createContext, useState, useEffect, useCallback, useMemo } from 'react';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      /** Najpierw refresh — przy powrocie po czasie access jest świeży, /me często bez 401 w konsoli */
      await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      let res = await fetch('/api/auth/me', { credentials: 'include' });
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
    }
  }, []);

  useEffect(() => {
    refreshUser();
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
