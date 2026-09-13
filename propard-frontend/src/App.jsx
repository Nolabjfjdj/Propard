import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';
import HelpPage from './pages/HelpPage';
import ContactPage from './pages/ContactPage';
import AdminPage from './pages/AdminPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import GlobalAnnouncement from './components/GlobalAnnouncement';
import OfflineGame from './components/OfflineGame';

async function checkPropardServer() {
  if (!navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    /*
     * 401 = le serveur fonctionne mais aucun token valide.
     * 200 = le serveur fonctionne et le token est valide.
     *
     * Les 5xx sont considérés comme indisponibilité du backend.
     */
    return response.status < 500;
  } catch {
    /*
     * Failed fetch = pas de connexion au serveur/origine.
     */
    return false;
  }
}

function OfflineGate({ children }) {
  const [serverAvailable, setServerAvailable] = useState(true);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    const available = await checkPropardServer();

    setServerAvailable(available);
    setChecking(false);

    return available;
  }, []);

  useEffect(() => {
    let mounted = true;
    let interval;

    const initialCheck = async () => {
      const available = await checkPropardServer();

      if (!mounted) return;

      setServerAvailable(available);
      setChecking(false);
    };

    initialCheck();

    const handleOnline = () => {
      check();
    };

    const handleOffline = () => {
      setServerAvailable(false);
      setChecking(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    /*
     * Si le Wi-Fi fonctionne mais que le backend Propard tombe,
     * navigator.onLine ne changera pas. On reteste donc régulièrement.
     */
    interval = window.setInterval(() => {
      check();
    }, 10000);

    return () => {
      mounted = false;

      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      window.clearInterval(interval);
    };
  }, [check]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 13
        }}
      >
        Connexion à Propard...
      </div>
    );
  }

  if (!serverAvailable) {
    return (
      <OfflineGame
        onRetry={async () => {
          const available = await check();

          if (available) {
            /*
             * On recharge l'URL actuelle afin que la page demandée
             * reprenne normalement.
             */
            window.location.reload();
          }
        }}
      />
    );
  }

  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    if (path === '/' && !user) {
      const hasLoggedInBefore =
        localStorage.getItem('propard_has_logged_in') === 'true';

      const destination = hasLoggedInBefore
        ? '/login'
        : '/register';

      if (path !== destination) {
        window.history.replaceState({}, '', destination);
        setPath(destination);
      }

      return;
    }

    if ((path === '/login' || path === '/register') && user) {
      window.history.replaceState({}, '', '/');
      setPath('/');
    }
  }, [loading, user, path]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary)'
        }}
      >
        <p
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)'
          }}
        >
          Chargement...
        </p>
      </div>
    );
  }

  if (path === '/login') {
    if (user) {
      return null;
    }

    return <AuthPage mode="login" />;
  }

  if (path === '/register') {
    if (user) {
      return null;
    }

    return <AuthPage mode="register" />;
  }

  if (path === '/help') {
    return <HelpPage />;
  }

  if (path === '/help/contact') {
    if (!user) {
      window.history.replaceState({}, '', '/login');
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
      window.history.replaceState({}, '', '/login');
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

  if (path.startsWith('/group/')) {
    if (!user) {
      window.history.replaceState({}, '', '/login');
      return null;
    }

    const groupId =
      path.split('/group/')[1];

    return (
      <>
        <AppPage initialGroupId={groupId} />
        <GlobalAnnouncement />
      </>
    );
  }

  if (path.startsWith('/profile/')) {
    if (!user) {
      window.history.replaceState({}, '', '/login');
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

    return null;
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

        <a href="/" style={styles.btn}>
          Retour à l'accueil
        </a>
      </div>
    </div>
  );
}

function AppWithOfflineGate() {
  return (
    <OfflineGate>
      <App />
    </OfflineGate>
  );
}

export { AppWithOfflineGate };

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
};
