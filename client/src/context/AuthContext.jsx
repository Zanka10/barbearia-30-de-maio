import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  /** scope: 'client' (área do cliente) ou 'staff' (painel de gestão). */
  const login = useCallback(async (identifier, password, scope) => {
    const { user } = await api.post('/auth/login', { identifier, password, scope });
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (data) => {
    const { user } = await api.post('/auth/register', data);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      login,
      logout,
      register,
      refresh,
      isAdmin: user?.role === 'admin',
      isStaff: user?.role === 'admin' || user?.role === 'barber',
    }),
    [user, loading, login, logout, register, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
