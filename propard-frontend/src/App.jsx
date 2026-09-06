import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
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