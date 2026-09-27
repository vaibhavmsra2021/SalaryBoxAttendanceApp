import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { login as loginRequest, setUnauthorizedHandler } from './api';
import type { Session } from './types';

const STORAGE_KEY = 'attendance.session';

type AuthValue = {
  session: Session | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSession(JSON.parse(raw) as Session);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthValue>(() => {
    return {
      session,
      ready,
      async signIn(username, password) {
        const next = await loginRequest(username.trim(), password);
        setSession(next);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      async signOut() {
        setSession(null);
        await AsyncStorage.removeItem(STORAGE_KEY);
      },
    };
  }, [session, ready]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession(null);
      void AsyncStorage.removeItem(STORAGE_KEY);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
