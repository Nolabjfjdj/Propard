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

  // Mise à jour locale partielle du user courant (ex: après modification du
  // profil), pour refléter immédiatement displayName/avatar dans l'UI sans
  // attendre le prochain polling /api/auth/me (30s).
  const updateUser = (partial) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem('propard_user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);" et le App.jsx "import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';
import HelpPage from './pages/HelpPage';
import ContactPage from './pages/ContactPage';
import AdminPage from './pages/AdminPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import GlobalAnnouncement from './components/GlobalAnnouncement';

export default function App() {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  if (loading) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh'
    }}>
      <p style={{
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)'
      }}>
        Chargement...
      </p>
    </div>
  );

  if (path === '/help') return <HelpPage />;

  if (path === '/help/contact') {
    if (!user) {
      window.location.href = '/';
      return null;
    }

    return (
      <>
        <ContactPage />
        <GlobalAnnouncement />
      </>
    );
  }

  if (path.startsWith('/chat/')) {
    if (!user) {
      window.location.href = '/';
      return null;
    }

    const friendId = path.split('/chat/')[1];

    return (
      <>
        <AppPage initialFriendId={friendId} />
        <GlobalAnnouncement />
      </>
    );
  }

  // ─── Page de profil utilisateur (/profile/:userId) ─────────────────────
  // Même schéma que /chat/:friendId : la "vraie page" est gérée en interne
  // par AppPage (sidebar + zone principale), pas par un composant séparé
  // sans sidebar, pour rester cohérent avec le reste de l'appli.
  if (path.startsWith('/profile/')) {
    if (!user) {
      window.location.href = '/';
      return null;
    }

    const profileUserId = path.split('/profile/')[1];

    return (
      <>
        <AppPage initialProfileUserId={profileUserId} />
        <GlobalAnnouncement />
      </>
    );
  }

  /*
   * L'administration ne reçoit pas les annonces utilisateur.
   */
  if (path === '/admin-propard-secret') {
    return <AdminPage />;
  }

  if (path === '/privacy') {
    return <PrivacyPage />;
  }

  if (path === '/terms') {
    return <TermsPage />;
  }

  if (path === '/') {
    if (user) {
      return (
        <>
          <AppPage />
          <GlobalAnnouncement />
        </>
      );
    }

    return <AuthPage />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.code}>404</p>

        <p style={styles.title}>
          Page introuvable
        </p>

        <p style={styles.sub}>
          Cette page n'existe pas sur Propard.
        </p>

        <a
          href="/"
          style={styles.btn}
        >
          ← Retour à l'accueil
        </a>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '48px 40px',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%'
  },

  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: '64px',
    fontWeight: '700',
    color: 'var(--accent)',
    marginBottom: '8px'
  },

  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  },

  sub: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '24px'
  },

  btn: {
    display: 'inline-block',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none'
  }
};"