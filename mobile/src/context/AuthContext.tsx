import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, User } from '../api/auth';
import { supplierApi } from '../api/supplier';
import { setTokens, clearTokens, tryRefresh } from '../api/tokenManager';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  profileCategory: string | null;  // null = geen categorie ingesteld
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  oauthLogin: (provider: 'google' | 'apple', idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileCategory: (category: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchCategory(): Promise<string | null> {
  try {
    const profile = await supplierApi.getProfile();
    return (profile as any).category ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true, profileCategory: null });

  useEffect(() => {
    (async () => {
      try {
        // client.ts handles 401 → token refresh → retry internally.
        // If me() succeeds, the session is restored (possibly after a silent token refresh).
        const user = await authApi.me();
        const profileCategory = await fetchCategory();
        setState({ user, isLoading: false, profileCategory });
      } catch (err: any) {
        // Network/connection errors: server unreachable. Don't wipe the tokens —
        // they may still be valid once the connection is restored.
        const isNetworkError =
          err?.name === 'AbortError' ||
          err?.name === 'TypeError' ||
          err?.message?.includes('Geen verbinding');

        if (isNetworkError) {
          setState({ user: null, isLoading: false, profileCategory: null });
          return;
        }

        // Auth error (token truly expired/invalid). Clear tokens and go to login.
        await clearTokens();
        setState({ user: null, isLoading: false, profileCategory: null });
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { accessToken, refreshToken } = await authApi.login(email, password);
    await setTokens(accessToken, refreshToken);
    const user = await authApi.me();
    const profileCategory = await fetchCategory();
    setState({ user, isLoading: false, profileCategory });
  }

  async function oauthLogin(provider: 'google' | 'apple', idToken: string) {
    const { accessToken, refreshToken } = await authApi.oauthLogin(provider, idToken);
    await setTokens(accessToken, refreshToken);
    const user = await authApi.me();
    const profileCategory = await fetchCategory();
    setState({ user, isLoading: false, profileCategory });
  }

  async function register(name: string, email: string, password: string) {
    const { accessToken, refreshToken } = await authApi.register(name, email, password);
    await setTokens(accessToken, refreshToken);
    const user = await authApi.me();
    // Nieuwe gebruiker heeft nog geen categorie
    setState({ user, isLoading: false, profileCategory: null });
  }

  async function logout() {
    await clearTokens();
    setState({ user: null, isLoading: false, profileCategory: null });
  }

  function updateProfileCategory(category: string) {
    setState((prev) => ({ ...prev, profileCategory: category }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, oauthLogin, logout, updateProfileCategory }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
