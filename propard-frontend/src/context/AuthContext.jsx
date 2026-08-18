import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { generateKeyPair, storePrivateKey, hasStoredPrivateKey } from '../utils/crypto';

const AuthContext = createContext(null);

const ensureEncryptionKeys = async (userId, authToken) => {
  if (!userId || !authToken) return;
  try {
    if (hasStoredPrivateKey(userId)) return;
    const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();
    storePrivateKey(userId, privateKeyJwk);
    await axios.patch('/api/auth/publickey', { publicKey: JSON.stringify(publicKeyJwk) }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('🔐 Clés E2EE générées avec succès');
  } catch (err) {
    console.error('❌ Erreur génération clés de chiffrement:', err);
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('propard_token');
    const savedUser = localStorage.getItem('propard_user');
    if (!savedToken || !savedUser) { setLoading(false); return; }

    let parsedUser;
    try { parsedUser = JSON.parse(savedUser); } catch {
      localStorage.removeItem('propard_token');
      localStorage.removeItem('propard_user');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const response = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } });
        const serverUser = response.data;
        const normalizedUser = { ...serverUser, id: serverUser.id || serverUser._id };
        setToken(savedToken);
        setUser(normalizedUser);
        localStorage.setItem('propard_user', JSON.stringify(normalizedUser));
        await ensureEncryptionKeys(normalizedUser.id, savedToken);
      } catch (err) {
        console.error('Erreur vérification session:', err);
        localStorage.removeItem('propard_token');
        localStorage.removeItem('propard_user');
        window.location.href = '/';
      } finally { setLoading(false); }
    };
    verify();

    const interval = setInterval(() => {
      axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } }).catch(() => {
        localStorage.removeItem('propard_token');
        localStorage.removeItem('propard_user');
        window.location.href = '/';
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          localStorage.removeItem('propard_token');
          localStorage.removeItem('propard_user');
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const login = async (userData, userToken) => {
    const normalized = { ...userData, id: userData.id || userData._id };
    setUser(normalized); setToken(userToken);
    localStorage.setItem('propard_token', userToken);
    localStorage.setItem('propard_user', JSON.stringify(normalized));
    await ensureEncryptionKeys(normalized.id, userToken);
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('propard_token');
    localStorage.removeItem('propard_user');
  };

  return <AuthContext.Provider value={{ user, token, login, logout, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
