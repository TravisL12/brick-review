import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, isUnauthorized, SESSION_EXPIRED_EVENT } from '../lib/api';
import type { AuthUser } from '../lib/types';

interface AuthState {
  user: AuthUser | null;
  /** True until the initial `/auth/me` settles, so the app does not flash the sign-in page. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The session lives in an httpOnly cookie the page cannot read, so the only way
  // to know who is signed in is to ask the API.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err: unknown) => {
        // 401 is the ordinary "nobody is signed in" answer, not a failure worth surfacing.
        if (!cancelled && !isUnauthorized(err)) console.warn('Could not load session', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 from anywhere means the cookie is gone or stale; stop pretending
  // otherwise rather than leaving every page showing "Not signed in".
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await api.login({ email, password }));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setUser(await api.register({ email, password, displayName: displayName.trim() || undefined }));
  }, []);

  const signOut = useCallback(async () => {
    // Clear locally even if the request fails — the user asked to be signed out,
    // and an expired cookie is exactly the case where this can 4xx.
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
