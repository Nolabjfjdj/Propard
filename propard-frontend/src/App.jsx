import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';
import HelpPage from './pages/HelpPage';
import ContactPage from './pages/ContactPage';
import AdminPage from './pages/AdminPage';

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

 if (path === '/admin-propard-secret') return <AdminPage />;

 if (path === '/') return user ? <AppPage /> : <AuthPage />;

 // Toute autre route → 404
 return (
   <div style={styles.page}>
     <div style={styles.card}>
       <p style={styles.code}>404</p>
       <p style={styles.title}>Page introuvable</p>
       <p style={styles.sub}>Cette page n'existe pas sur Propard.</p>
       <a href="/" style={styles.btn}>← Retour à l'accueil</a>
     </div>
   </div>
 );
}

const styles = {
 page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
 card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '48px 40px', textAlign: 'center', maxWidth: '400px', width: '100%' },
 code: { fontFamily: 'var(--font-mono)', fontSize: '64px', fontWeight: '700', color: 'var(--accent)', marginBottom: '8px' },
 title: { fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
 sub: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' },
 btn: { display: 'inline-block', background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }
};
