import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import {
  generateKeyPair,
  storePrivateKey,
  hasStoredPrivateKey
} from '../utils/crypto';

const AuthContext = createContext(null);

/*
 * Génère une paire ECDH au premier démarrage du compte.
 *
 * IMPORTANT :
 * - La clé privée reste uniquement dans localStorage.
 * - La clé privée n'est JAMAIS envoyée au serveur.
 * - Seule la clé publique est enregistrée dans MongoDB.
 */
const ensureEncryptionKeys = async (userId, authToken) => {
  if (!userId || !authToken) return;

  try {
    /*
     * Si une clé privée existe déjà, on ne génère surtout pas
     * une nouvelle paire : cela rendrait les anciens messages
     * impossibles à déchiffrer.
     */
    if (hasStoredPrivateKey(userId)) {
      return;
    }

    const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();

    /*
     * Stockage LOCAL uniquement.
     * La clé privée ne quitte jamais le navigateur.
     */
    storePrivateKey(userId, privateKeyJwk);

    /*
     * Seule la clé publique est envoyée au backend.
     */
    await axios.patch(
      '/api/auth/publickey',
      {
        publicKey: JSON.stringify(publicKeyJwk)
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    );

    console.log('🔐 Clés E2EE générées avec succès');
  } catch (err) {
    console.error(
      '❌ Erreur génération clés de chiffrement:',
      err
    );
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  /*
   * Restauration de session
   */
  useEffect(() => {
    const savedToken = localStorage.getItem('propard_token');
    const savedUser = localStorage.getItem('propard_user');

    if (!savedToken || !savedUser) {
      setLoading(false);
      return;
    }

    let parsedUser;

    try {
      parsedUser = JSON.parse(savedUser);
    } catch {
      localStorage.removeItem('propard_token');
      localStorage.removeItem('propard_user');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const response = await axios.get('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${savedToken}`
          }
        });

        /*
         * On utilise les données fraîches du serveur.
         */
        const serverUser = response.data;

        const normalizedUser = {
          ...serverUser,
          id: serverUser.id || serverUser._id
        };

        setToken(savedToken);
        setUser(normalizedUser);

        localStorage.setItem(
          'propard_user',
          JSON.stringify(normalizedUser)
        );

        /*
         * Vérifie/génère la paire E2EE si nécessaire.
         */
        await ensureEncryptionKeys(
          normalizedUser.id,
          savedToken
        );
      } catch (err) {
        console.error('Erreur vérification session:', err);

        localStorage.removeItem('propard_token');
        localStorage.removeItem('propard_user');

        window.location.href = '/';
      } finally {
        setLoading(false);
      }
    };

    verify();

    /*
     * Vérification toutes les 30 secondes.
     */
    const interval = setInterval(() => {
      axios
        .get('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${savedToken}`
          }
        })
        .catch(() => {
          localStorage.removeItem('propard_token');
          localStorage.removeItem('propard_user');
          window.location.href = '/';
        });
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  /*
   * Intercepteur Axios.
   *
   * Si le JWT devient invalide, on déconnecte automatiquement.
   */
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

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  /*
   * Connexion / inscription réussie.
   */
  const login = async (userData, userToken) => {
    const normalized = {
      ...userData,
      id: userData.id || userData._id
    };

    setUser(normalized);
    setToken(userToken);

    localStorage.setItem(
      'propard_token',
      userToken
    );

    localStorage.setItem(
      'propard_user',
      JSON.stringify(normalized)
    );

    /*
     * Création des clés E2EE si nécessaire.
     */
    await ensureEncryptionKeys(
      normalized.id,
      userToken
    );
  };

  /*
   * Déconnexion.
   *
   * NOTE :
   * On ne supprime PAS automatiquement la clé privée ici.
   * Cela évite de perdre les anciens messages chiffrés
   * lors d'une simple déconnexion/reconnexion.
   */
  const logout = () => {
    setUser(null);
    setToken(null);

    localStorage.removeItem('propard_token');
    localStorage.removeItem('propard_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);