import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';
import HelpPage from './pages/HelpPage';
import ContactPage from './pages/ContactPage';

export default function App() {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Chargement...</p>
    </div>
  );

  if (path === '/help') return <HelpPage />;

  if (path === '/help/contact') {
    if (!user) { window.location.href = '/'; return null; }
    return <ContactPage />;
  }

  if (path.startsWith('/chat/')) {
    if (!user) { window.location.href = '/'; return null; }
    const friendId = path.split('/chat/')[1];
    return <AppPage initialFriendId={friendId} />;
  }

  return user ? <AppPage /> : <AuthPage />;
}
