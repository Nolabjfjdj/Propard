import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
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
     * CAS 1 — la clé privée existe déjà sur cet appareil.
     * On la conserve absolument : c'est elle qui permet de déchiffrer
     * les messages existants. On synchronise sa clé publique et, si
     * possible, on crée la sauvegarde chiffrée.
     */
    if (existingPriv) {
      const derivedPublicKeyJwk =
        publicKeyFromPrivateJwk(existingPriv);

      let backup = null;

      if (password) {
        const backupResponse = await axios.get(
          '/api/auth/keybackup',
          {
            headers: {
              Authorization: `Bearer ${authToken}`
            }
          }
        );

        backup = backupResponse.data?.backup || null;
      }

      /*
       * S'il existe déjà une sauvegarde, elle représente l'identité E2EE
       * canonique du compte. On vérifie donc que la clé locale correspond.
       * Cela évite qu'un appareil contenant une autre clé écrase l'identité.
       *
       * S'il n'existe PAS encore de sauvegarde, la clé locale est la seule
       * copie historique connue. Elle devient alors la clé canonique et sa
       * clé publique peut être resynchronisée sur le serveur. C'est important
       * pour récupérer un compte ancien dont la clé publique a été remplacée
       * par erreur sur un autre navigateur avant la migration.
       */
      if (backup) {
        const restoredFromBackup =
          await decryptPrivateKeyBackup(
            backup,
            password
          );

        const backupPublicKey =
          publicKeyFromPrivateJwk(restoredFromBackup);

        if (!samePublicKey(derivedPublicKeyJwk, backupPublicKey)) {
          throw new Error(
            'La clé E2EE locale ne correspond pas à la sauvegarde du compte.'
          );
        }
      }

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

      if (password && !backup) {
        await uploadKeyBackup(
          authToken,
          existingPriv,
          password
        );
      }

      return;
    }

    /*
     * CAS 2 — nouvel appareil.
     * Si le compte possède une sauvegarde, on restaure EXACTEMENT la
     * même clé privée. Il ne faut surtout pas en générer une nouvelle.
     */
    if (password) {
      const backupResponse = await axios.get(
        '/api/auth/keybackup',
        {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      );

      const backup = backupResponse.data?.backup;

      if (backup) {
        const restoredPrivateKey =
          await decryptPrivateKeyBackup(
            backup,
            password
          );

        const restoredPublicKey =
          publicKeyFromPrivateJwk(restoredPrivateKey);

        /*
         * La sauvegarde est la source de vérité pour l'identité E2EE.
         * Si la clé publique actuellement enregistrée sur le serveur est
         * différente (par exemple parce qu'un ancien navigateur a généré
         * une mauvaise paire), on la remplace par la clé publique dérivée
         * de la clé privée restaurée. Cela ne modifie aucun message existant.
         */
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

        storePrivateKey(
          userId,
          restoredPrivateKey
        );

        console.log(
          '🔐 Clé E2EE restaurée depuis la sauvegarde chiffrée.'
        );

        return;
      }
    }

    /*
     * CAS 3 — ancien compte sans sauvegarde.
     * Si le serveur connaît déjà une clé publique, NE JAMAIS en générer
     * une autre : cela casserait les messages existants. L'utilisateur
     * doit simplement revenir sur l'ancien appareil pour créer la backup.
     */
    if (serverPub) {
      console.warn(
        '🔐 Aucune sauvegarde E2EE disponible sur ce compte. Aucune nouvelle clé n’a été générée.'
      );
      return;
    }

    /*
     * CAS 4 — compte totalement nouveau sans clé publique.
     * On génère la première paire de clés puis on sauvegarde la clé privée
     * chiffrée si le mot de passe est disponible.
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

    if (password) {
      await uploadKeyBackup(
        authToken,
        privateKeyJwk,
        password
      );
    }

    console.log(
      '🔐 Clés E2EE générées avec succès'
    );
  } catch (err) {
    /*
     * Les erreurs cryptographiques doivent remonter lorsque l'utilisateur
     * vient de se connecter : sinon il pourrait entrer sur un nouvel appareil
     * avec une clé incorrecte et casser silencieusement son identité E2EE.
     */
    if (err.response?.status === 401) {
      console.warn(
        '🔐 Session expirée pendant la synchronisation E2EE.'
      );
      return;
    }

    if (password && !err.response) {
      throw err;
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
    userToken,
    password
  ) => {
    const normalized = {
      ...userData,
      id: userData.id || userData._id
    };

    /*
     * On synchronise/restaure d'abord l'identité E2EE.
     * Ainsi, si la restauration échoue, on ne laisse pas une session
     * partiellement enregistrée dans localStorage.
     */
    await ensureEncryptionKeys(
      normalized.id,
      userToken,
      password,
      normalized.publicKey
    );

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