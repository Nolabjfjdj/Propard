import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Chargement...</p>
    </div>
  );

  return user ? <AppPage /> : <AuthPage />;
}