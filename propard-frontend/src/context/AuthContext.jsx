import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import {
  generateKeyPair,
  storePrivateKey,
  getStoredPrivateKeyJwk,
  publicKeyFromPrivateJwk,
  encryptPrivateKeyBackup,
  decryptPrivateKeyBackup
} from '../utils/crypto';

const AuthContext = createContext(null);

const samePublicKey = (a, b) => {
  if (!a || !b) return false;

  return (
    a.kty === b.kty &&
    a.crv === b.crv &&
    a.x === b.x &&
    a.y === b.y
  );
};

const parsePublicKey = value => {
  if (!value) return null;

  try {
    return typeof value === 'string'
      ? JSON.parse(value)
      : value;
  } catch {
    return null;
  }
};

const uploadKeyBackup = async (authToken, privateKeyJwk, password) => {
  if (!password) return false;

  const backup = await encryptPrivateKeyBackup(
    privateKeyJwk,
    password
  );

  await axios.post(
    '/api/auth/keybackup',
    { backup },
    {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }
  );

  return true;
};

const ensureEncryptionKeys = async (
  userId,
  authToken,
  password = null,
  serverPublicKey = null
) => {
  if (!userId || !authToken) return;

  try {
    const existingPriv = getStoredPrivateKeyJwk(userId);
    const serverPub = parsePublicKey(serverPublicKey);

    /*
     * IMPORTANT : lorsqu'un mot de passe est disponible (connexion
     * explicite), la sauvegarde serveur est la source de vérité.
     * Même si un ancien navigateur possède déjà une clé locale différente,
     * on restaure la clé canonique avant toute synchronisation de publicKey.
     */
    if (password) {
      const backupResponse = await api.get(
        '/api/auth/keybackup',
        {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      );

      const backup = backupResponse.data?.backup || null;

      if (backup) {
        const restoredPrivateKey =
          await decryptPrivateKeyBackup(
            backup,
            password
          );

        const restoredPublicKey =
          publicKeyFromPrivateJwk(restoredPrivateKey);

        /*
         * La clé privée restaurée est canonique. On la stocke avant de
         * synchroniser le serveur, puis on remet exactement sa clé publique.
         */
        storePrivateKey(userId, restoredPrivateKey);

        if (
          !serverPub ||
          !samePublicKey(restoredPublicKey, serverPub)
        ) {
          await axios.patch(
            '/api/auth/publickey',
            {
              publicKey: JSON.stringify(restoredPublicKey)
            },
            {
              headers: {
                Authorization: `Bearer ${authToken}`
              }
            }
          );
        }

        console.log(
          '🔐 Clé E2EE canonique restaurée depuis la sauvegarde.'
        );

        return;
      }

      /*
       * Pas de backup : on ne génère jamais une nouvelle clé si une clé
       * locale ou publique existe déjà, car cela pourrait rendre les anciens
       * messages indéchiffrables.
       */
      if (existingPriv) {
        const derivedPublicKeyJwk =
          publicKeyFromPrivateJwk(existingPriv);

        if (
          !serverPub ||
          !samePublicKey(derivedPublicKeyJwk, serverPub)
        ) {
          await axios.patch(
            '/api/auth/publickey',
            {
              publicKey: JSON.stringify(derivedPublicKeyJwk)
            },
            {
              headers: {
                Authorization: `Bearer ${authToken}`
              }
            }
          );
        }

        await uploadKeyBackup(
          authToken,
          existingPriv,
          password
        );

        return;
      }

      if (serverPub) {
        console.warn(
          '🔐 Aucune sauvegarde E2EE disponible. Aucune nouvelle clé n’a été générée.'
        );
        return;
      }
    }

    /*
     * Restauration automatique de session (sans mot de passe) :
     * ne JAMAIS modifier la clé publique du compte à partir d'une clé locale.
     * Une ancienne clé locale pourrait être obsolète. La synchronisation
     * canonique se fait lors de la connexion avec le backup + mot de passe.
     */
    if (existingPriv) {
      return;
    }

    /*
     * Si aucun mot de passe n'est disponible et que le serveur possède déjà
     * une clé publique, on attend une connexion explicite pour restaurer la
     * clé privée depuis la sauvegarde.
     */
    if (serverPub) {
      return;
    }

    /*
     * Compte totalement nouveau : génération de la première paire.
     */
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
    if (err.response?.status === 401) {
      console.warn(
        '🔐 Session expirée pendant la synchronisation E2EE.'
      );
      return;
    }

    /*
     * Une erreur cryptographique pendant une connexion explicite doit être
     * visible : continuer avec une clé absente ou incorrecte casserait les
     * anciens messages sans que l'utilisateur le sache.
     */
    if (password) {
      throw err;
    }

    console.warn(
      '🔐 Synchronisation E2EE automatique reportée.'
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
        const response = await api.get(
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
          savedToken,
          null,
          normalizedUser.publicKey
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
        await api.get(
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
    userToken,
    password
  ) => {
    const normalized = {
      ...userData,
      id: userData.id || userData._id
    };

    // La connexion au compte ne doit jamais être confondue avec la
    // restauration E2EE. On enregistre d'abord la session.
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

    try {
      await ensureEncryptionKeys(
        normalized.id,
        userToken,
        password,
        normalized.publicKey
      );
    } catch (err) {
      console.error('Erreur de restauration E2EE:', err);

      // Le compte est bien connecté. On remonte toutefois une erreur
      // explicite à AuthPage au lieu du générique « Erreur serveur ».
      const message =
        err.response?.data?.error ||
        err.message ||
        'Impossible de restaurer la clé E2EE sur cet appareil.';

      const e2eeError = new Error(message);
      e2eeError.code = 'E2EE_RESTORE_FAILED';
      throw e2eeError;
    }
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