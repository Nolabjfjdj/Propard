import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import {
  generateKeyPair,
  storePrivateKey,
  getStoredPrivateKeyJwk,
  publicKeyFromPrivateJwk
} from '../utils/crypto';

const AuthContext = createContext(null);

const ensureEncryptionKeys = async (userId, authToken) => {
  if (!userId || !authToken) return;
  try {
    const existingPriv = getStoredPrivateKeyJwk(userId);

    if (existingPriv) {
      // Une clé locale existe déjà : on renvoie systématiquement la clé
      // publique correspondante au serveur (idempotent, sans régénérer
      // de nouvelle paire). Ça corrige automatiquement les comptes dont
      // un envoi précédent avait échoué silencieusement (ex: coupure
      // réseau, backend indisponible) sans jamais casser le
      // déchiffrement des messages déjà échangés.
      const derivedPublicKeyJwk = publicKeyFromPrivateJwk(existingPriv);
      await axios.patch('/api/auth/publickey', { publicKey: JSON.stringify(derivedPublicKeyJwk) }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      return;
    }

    // Aucune clé locale : première fois sur cet appareil.
    const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();

    await axios.patch('/api/auth/publickey', { publicKey: JSON.stringify(publicKeyJwk) }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    // Important : on ne stocke la clé privée QU'APRÈS confirmation que le
    // serveur a bien reçu la clé publique correspondante. Sinon, une
    // panne réseau ponctuelle laisserait une clé locale à jamais
    // désynchronisée du serveur, sans aucun moyen de le détecter aux
    // connexions suivantes (c'était le bug : hasStoredPrivateKey()
    // renvoyait true pour toujours, donc plus aucune tentative de
    // renvoi n'avait lieu).
    storePrivateKey(userId, privateKeyJwk);
    console.log('🔐 Clés E2EE générées avec succès');
  } catch (err) {
    console.error('❌ Erreur génération/synchronisation des clés de chiffrement:', err);
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
