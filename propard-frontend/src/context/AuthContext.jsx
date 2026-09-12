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
      const derivedPublicKeyJwk =
        publicKeyFromPrivateJwk(existingPriv);

      await axios.patch(
        '/api/auth/publickey',
        {
          publicKey: JSON.stringify(
            derivedPublicKeyJwk
          )
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      );

      return;
    }

    const {
      publicKeyJwk,
      privateKeyJwk
    } = await generateKeyPair();

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

    storePrivateKey(
      userId,
      privateKeyJwk
    );

    console.log(
      '🔐 Clés E2EE générées avec succès'
    );
  } catch (err) {
    /*
     * Une erreur réseau ne doit jamais déconnecter
     * l'utilisateur.
     *
     * Les clés seront resynchronisées au prochain
     * passage où le serveur sera disponible.
     */
    if (err.response?.status === 401) {
      console.warn(
        '🔐 Session expirée pendant la synchronisation E2EE.'
      );
      return;
    }

    console.warn(
      '🔐 Serveur indisponible : synchronisation E2EE reportée.'
    );
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken =
      localStorage.getItem('propard_token');

    const savedUser =
      localStorage.getItem('propard_user');

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

    /*
     * On restaure immédiatement les données locales.
     *
     * Ça permet notamment au système offline de ne pas
     * considérer l'utilisateur comme déconnecté simplement
     * parce que le backend est temporairement inaccessible.
     */
    setToken(savedToken);
    setUser(parsedUser);

    const verify = async () => {
      try {
        const response = await axios.get(
          '/api/auth/me',
          {
            headers: {
              Authorization: `Bearer ${savedToken}`
            }
          }
        );

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

        await ensureEncryptionKeys(
          normalizedUser.id,
          savedToken
        );
      } catch (err) {
        /*
         * SEULEMENT un vrai 401 signifie que la session
         * n'est plus valide.
         */
        if (err.response?.status === 401) {
          localStorage.removeItem(
            'propard_token'
          );

          localStorage.removeItem(
            'propard_user'
          );

          setToken(null);
          setUser(null);

          window.location.href = '/';

          return;
        }

        /*
         * Erreur réseau / backend indisponible :
         * on conserve la session locale.
         */
        console.warn(
          '🌐 Propard est temporairement indisponible. Session conservée localement.'
        );
      } finally {
        setLoading(false);
      }
    };

    verify();

    const interval = setInterval(async () => {
      try {
        await axios.get(
          '/api/auth/me',
          {
            headers: {
              Authorization: `Bearer ${savedToken}`
            }
          }
        );
      } catch (err) {
        /*
         * Une déconnexion automatique n'est effectuée
         * que pour un vrai 401.
         */
        if (err.response?.status === 401) {
          localStorage.removeItem(
            'propard_token'
          );

          localStorage.removeItem(
            'propard_user'
          );

          setToken(null);
          setUser(null);

          window.location.href = '/';
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interceptor =
      axios.interceptors.response.use(
        response => response,

        error => {
          if (error.response?.status === 401) {
            localStorage.removeItem(
              'propard_token'
            );

            localStorage.removeItem(
              'propard_user'
            );

            window.location.href = '/';
          }

          return Promise.reject(error);
        }
      );

    return () =>
      axios.interceptors.response.eject(
        interceptor
      );
  }, []);

  const login = async (
    userData,
    userToken
  ) => {
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

    localStorage.setItem(
      'propard_has_logged_in',
      'true'
    );

    await ensureEncryptionKeys(
      normalized.id,
      userToken
    );
  };

  const logout = () => {
    setUser(null);
    setToken(null);

    localStorage.removeItem(
      'propard_token'
    );

    localStorage.removeItem(
      'propard_user'
    );
  };

  const updateUser = partial => {
    setUser(prev => {
      if (!prev) return prev;

      const next = {
        ...prev,
        ...partial
      };

      localStorage.setItem(
        'propard_user',
        JSON.stringify(next)
      );

      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUser,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () =>
  useContext(AuthContext);