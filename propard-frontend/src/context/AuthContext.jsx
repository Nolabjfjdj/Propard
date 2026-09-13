import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import {
  generateKeyPair,
  storePrivateKey,
  getStoredPrivateKeyJwk,
  publicKeyFromPrivateJwk,
  publicKeysEqual,
  createPrivateKeyBackup,
  decryptPrivateKeyBackup
} from '../utils/crypto';

const AuthContext = createContext(null);

const syncEncryptionKeys = async (
  userId,
  authToken,
  password = null
) => {
  if (!userId || !authToken) {
    return;
  }

  /*
   * On récupère l'état de la sauvegarde E2EE avant de choisir
   * quelle clé doit être utilisée.
   */
  const backupResponse =
    await axios.get(
      '/api/auth/keybackup',
      {
        headers: {
          Authorization:
            `Bearer ${authToken}`
        }
      }
    );

  const serverPublicKey =
    backupResponse.data?.publicKey || null;

  const backup =
    backupResponse.data?.backup || null;

  let privateKey =
    getStoredPrivateKeyJwk(userId);

  /*
   * Si une sauvegarde existe et que le mot de passe est disponible,
   * elle devient la source de vérité. Cela permet à un nouvel
   * appareil de retrouver exactement la même identité E2EE.
   */
  if (
    backup &&
    password
  ) {
    const restored =
      await decryptPrivateKeyBackup(
        backup,
        password
      );

    if (restored) {
      privateKey = restored;

      storePrivateKey(
        userId,
        restored
      );
    } else if (!privateKey) {
      throw new Error(
        'Impossible de déchiffrer la sauvegarde de votre clé E2EE. Vérifie ton mot de passe.'
      );
    }
  }

  /*
   * Aucun backup et aucune clé locale :
   *
   * - nouveau compte => on peut créer une identité ;
   * - ancien compte => remplacer la clé casserait les anciens
   *   messages, donc on refuse plutôt que de détruire l'identité.
   */
  if (!privateKey) {
    if (serverPublicKey) {
      throw new Error(
        'Clé E2EE locale introuvable et aucune sauvegarde E2EE récupérable. Ce navigateur ne peut pas remplacer la clé sans risquer de rendre les anciens messages illisibles.'
      );
    }

    const generated =
      await generateKeyPair();

    privateKey =
      generated.privateKeyJwk;
  }

  const publicKey =
    publicKeyFromPrivateJwk(
      privateKey
    );

  /*
   * Si le serveur possède déjà une clé différente, cela peut
   * simplement être une ancienne version de Propard qui utilisait
   * une autre clé sur cet appareil. Si nous avons pu restaurer le
   * backup avec le mot de passe, le backup est la clé canonique.
   *
   * Pour une clé locale sans backup, on conserve la clé locale :
   * elle est la seule copie connue capable de déchiffrer les anciens
   * messages.
   */
  if (
    !serverPublicKey ||
    !publicKeysEqual(
      serverPublicKey,
      publicKey
    )
  ) {
    await axios.patch(
      '/api/auth/publickey',
      {
        publicKey:
          JSON.stringify(publicKey)
      },
      {
        headers: {
          Authorization:
            `Bearer ${authToken}`
        }
      }
    );
  }

  /*
   * La sauvegarde n'est créée/actualisée que lorsque le mot de passe
   * est disponible. Il n'est jamais stocké par Propard.
   */
  if (password) {
    const backupExists =
      !!backup;

    /*
     * Si nous avons restauré un backup existant, inutile de refaire
     * 600 000 itérations PBKDF2 à chaque connexion.
     *
     * S'il n'existe pas encore de backup, on en crée un maintenant.
     */
    if (!backupExists) {
      const encryptedBackup =
        await createPrivateKeyBackup(
          privateKey,
          password
        );

      await axios.put(
        '/api/auth/keybackup',
        encryptedBackup,
        {
          headers: {
            Authorization:
              `Bearer ${authToken}`
          }
        }
      );
    }
  }

  /*
   * Une nouvelle clé peut avoir été générée pour un compte neuf.
   * On s'assure également qu'elle est conservée localement.
   */
  storePrivateKey(
    userId,
    privateKey
  );

  return {
    privateKey,
    publicKey
  };
};

export function AuthProvider({
  children
}) {
  const [user, setUser] =
    useState(null);

  const [token, setToken] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    const savedToken =
      localStorage.getItem(
        'propard_token'
      );

    const savedUser =
      localStorage.getItem(
        'propard_user'
      );

    if (
      !savedToken ||
      !savedUser
    ) {
      setLoading(false);
      return;
    }

    let parsedUser;

    try {
      parsedUser =
        JSON.parse(savedUser);
    } catch {
      localStorage.removeItem(
        'propard_token'
      );

      localStorage.removeItem(
        'propard_user'
      );

      setLoading(false);
      return;
    }

    setToken(savedToken);
    setUser(parsedUser);

    const verify =
      async () => {
        try {
          const response =
            await axios.get(
              '/api/auth/me',
              {
                headers: {
                  Authorization:
                    `Bearer ${savedToken}`
                }
              }
            );

          const serverUser =
            response.data;

          const normalizedUser = {
            ...serverUser,
            id:
              serverUser.id ||
              serverUser._id
          };

          setToken(
            savedToken
          );

          setUser(
            normalizedUser
          );

          localStorage.setItem(
            'propard_user',
            JSON.stringify(
              normalizedUser
            )
          );

          /*
           * Au simple rechargement, le mot de passe n'est pas
           * disponible et ne doit pas être mémorisé. Une clé locale
           * existante reste donc utilisable telle quelle.
           */
          try {
            await syncEncryptionKeys(
              normalizedUser.id,
              savedToken,
              null
            );
          } catch (keyError) {
            console.warn(
              '🔐 Synchronisation E2EE reportée :',
              keyError.message
            );
          }
        } catch (err) {
          if (
            err.response?.status === 401
          ) {
            localStorage.removeItem(
              'propard_token'
            );

            localStorage.removeItem(
              'propard_user'
            );

            setToken(null);
            setUser(null);

            window.location.href =
              '/';

            return;
          }

          console.warn(
            '🌐 Propard est temporairement indisponible. Session conservée localement.'
          );
        } finally {
          setLoading(false);
        }
      };

    verify();

    const interval =
      setInterval(
        async () => {
          try {
            await axios.get(
              '/api/auth/me',
              {
                headers: {
                  Authorization:
                    `Bearer ${savedToken}`
                }
              }
            );
          } catch (err) {
            if (
              err.response?.status ===
              401
            ) {
              localStorage.removeItem(
                'propard_token'
              );

              localStorage.removeItem(
                'propard_user'
              );

              setToken(null);
              setUser(null);

              window.location.href =
                '/';
            }
          }
        },
        30000
      );

    return () =>
      clearInterval(interval);
  }, []);

  useEffect(() => {
    const interceptor =
      axios.interceptors.response.use(
        response => response,

        error => {
          if (
            error.response?.status ===
            401
          ) {
            localStorage.removeItem(
              'propard_token'
            );

            localStorage.removeItem(
              'propard_user'
            );

            window.location.href =
              '/';
          }

          return Promise.reject(
            error
          );
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
      id:
        userData.id ||
        userData._id
    };

    /*
     * On prépare/récupère la clé AVANT de rendre la session active.
     * Ainsi, une nouvelle connexion sur un nouvel appareil ne crée
     * jamais silencieusement une nouvelle identité E2EE.
     */
    await syncEncryptionKeys(
      normalized.id,
      userToken,
      password
    );

    setUser(normalized);
    setToken(userToken);

    localStorage.setItem(
      'propard_token',
      userToken
    );

    localStorage.setItem(
      'propard_user',
      JSON.stringify(
        normalized
      )
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
      if (!prev) {
        return prev;
      }

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

export const useAuth =
  () =>
    useContext(
      AuthContext
    );
