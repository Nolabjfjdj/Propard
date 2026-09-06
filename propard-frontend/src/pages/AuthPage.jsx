import { useState, useEffect } from ‘react’;
import { useAuth } from ‘./context/AuthContext’;
import AuthPage from ‘./pages/AuthPage’;
import AppPage from ‘./pages/AppPage’;
import HelpPage from ‘./pages/HelpPage’;
import ContactPage from ‘./pages/ContactPage’;
import AdminPage from ‘./pages/AdminPage’;
import PrivacyPage from ‘./pages/PrivacyPage’;
import TermsPage from ‘./pages/TermsPage’;
import GlobalAnnouncement from ‘./components/GlobalAnnouncement’;

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

const navigate = (to) => {
window.history.pushState({}, ‘’, to);
setPath(to);
};

if (loading) return (
<div style={{
display: ‘flex’,
alignItems: ‘center’,
justifyContent: ‘center’,
height: ‘100vh’
}}>
<p style={{
color: ‘var(–text-secondary)’,
fontFamily: ‘var(–font-mono)’
}}>
Chargement…
);

if (path === ‘/help’) return ;

if (path === ‘/help/contact’) {
if (!user) {
navigate(’/login’);
return null;
}

return (
  <>
    <ContactPage />
    <GlobalAnnouncement />
  </>
);

}

if (path.startsWith(’/chat/’)) {
if (!user) {
navigate(’/login’);
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

if (path.startsWith(’/profile/’)) {
if (!user) {
navigate(’/login’);
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

if (path === ‘/admin-propard-secret’) {
return ;
}

if (path === ‘/privacy’) {
return ;
}

if (path === ‘/terms’) {
return ;
}

// ─── Connexion ─────────────────────────────────────────────
if (path === ‘/login’) {
if (user) {
navigate(’/’);
return null;
}

return <AuthPage initialMode="login" />;

}

// ─── Inscription ──────────────────────────────────────────
if (path === ‘/register’) {
if (user) {
navigate(’/’);
return null;
}

return <AuthPage initialMode="register" />;

}

// ─── Page principale ──────────────────────────────────────
if (path === ‘/’) {
if (user) {
return (
<>
</>
);
}

// Pas connecté → inscription
navigate('/register');
return null;

}

// ─── 404 ──────────────────────────────────────────────────
return (
404

    <p style={styles.title}>
      Page introuvable
    </p>
    <p style={styles.sub}>
      Cette page n'existe pas sur Propard.
    </p>
    <button
      onClick={() => navigate('/')}
      style={styles.btn}
    >
      ← Retour à l'accueil
    </button>
  </div>
</div>

);
}

const styles = {
page: {
minHeight: ‘100vh’,
background: ‘var(–bg-primary)’,
display: ‘flex’,
alignItems: ‘center’,
justifyContent: ‘center’
},

card: {
background: ‘var(–bg-secondary)’,
border: ‘1px solid var(–border)’,
borderRadius: ‘var(–radius)’,
padding: ‘48px 40px’,
textAlign: ‘center’,
maxWidth: ‘400px’,
width: ‘100%’
},

code: {
fontFamily: ‘var(–font-mono)’,
fontSize: ‘64px’,
fontWeight: ‘700’,
color: ‘var(–accent)’,
marginBottom: ‘8px’
},

title: {
fontSize: ‘20px’,
fontWeight: ‘700’,
color: ‘var(–text-primary)’,
marginBottom: ‘8px’
},

sub: {
fontSize: ‘14px’,
color: ‘var(–text-secondary)’,
marginBottom: ‘24px’
},

btn: {
display: ‘inline-block’,
background: ‘var(–accent)’,
color: ‘#fff’,
borderRadius: ‘8px’,
padding: ‘10px 20px’,
fontSize: ‘14px’,
fontWeight: ‘600’,
textDecoration: ‘none’,
border: ‘none’,
cursor: ‘pointer’
}
};