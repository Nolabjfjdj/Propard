import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import socket from '../socket';
import FriendList from '../components/FriendList';
import Chat from '../components/Chat';
import AddFriend from '../components/AddFriend';

export default function AppPage() {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [hideIp, setHideIp] = useState(() => localStorage.getItem('propard_hideIp') === 'true');
  const [hideFriendIps, setHideFriendIps] = useState(() => localStorage.getItem('propard_hideFriendIps') === 'true');
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    socket.connect();
    socket.emit('authenticate', token);
    return () => socket.disconnect();
  }, [token]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    setShowSidebar(false); // Ferme la sidebar sur mobile quand on choisit un ami
  };

  return (
    <div style={styles.layout}>

      {/* ── Overlay sombre derrière la sidebar sur mobile ── */}
      {showSidebar && (
        <div style={styles.overlay} onClick={() => setShowSidebar(false)} />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        ...styles.sidebar,
        transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
        // Sur desktop, toujours visible
        '@media (min-width: 768px)': { transform: 'translateX(0)' }
      }}>
        <div style={styles.sidebarHeader}>
          <span style={styles.appName}>Propard<span style={{ color: 'var(--accent)' }}>.</span></span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={toggleTheme} style={styles.iconBtn}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button onClick={() => setShowSidebar(false)} style={{ ...styles.iconBtn, display: 'block' }}>✕</button>
          </div>
        </div>

        <div style={styles.ipCard}>
          <p style={styles.ipLabel}>Ton adresse</p>
          <p style={styles.ipValue}>
            {hideIp ? '███.███.███.███' : user?.ipAlias}
          </p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(user?.ipAlias)}>
              📋 Copier
            </button>
            <button style={styles.copyBtn} onClick={() => {
              const next = !hideIp;
              setHideIp(next);
              localStorage.setItem('propard_hideIp', next);
            }}>
              {hideIp ? '👁️ Afficher' : '🙈 Masquer'}
            </button>
          </div>
        </div>

        <button style={styles.addBtn} onClick={() => setShowAddFriend(true)}>+ Ajouter un ami</button>

        <FriendList
          token={token}
          selectedFriend={selectedFriend}
          onSelectFriend={handleSelectFriend}
          hideFriendIps={hideFriendIps}
          setHideFriendIps={(val) => {
            setHideFriendIps(val);
            localStorage.setItem('propard_hideFriendIps', val);
          }}
        />

        <button style={styles.logoutBtn} onClick={logout}>Déconnexion</button>
      </div>

      {/* ── Zone principale ── */}
      <div style={styles.main}>

        {/* Header mobile avec bouton hamburger */}
        <div style={styles.mobileHeader}>
          <button style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
          <span style={styles.mobileTitle}>
            {selectedFriend ? selectedFriend.username : 'Propard'}
          </span>
          <div style={{ width: '36px' }} /> {/* spacer pour centrer le titre */}
        </div>

        {selectedFriend ? (
          <Chat friend={selectedFriend} token={token} userId={user?.id} hideFriendIps={hideFriendIps} />
        ) : (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>💬</p>
            <p style={styles.emptyText}>Appuie sur ☰ pour voir tes amis</p>
          </div>
        )}
      </div>

      {showAddFriend && <AddFriend token={token} onClose={() => setShowAddFriend(false)} />}
    </div>
  );
}

const isMobile = window.innerWidth < 768;

const styles = {
  layout: { display: 'flex', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 99
  },
  sidebar: {
    position: isMobile ? 'fixed' : 'relative',
    top: 0, left: 0, bottom: 0,
    zIndex: 100,
    width: '280px',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '12px',
    overflowY: 'auto',
    transition: 'transform 0.25s ease'
  },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: '700' },
  iconBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px' },
  ipCard: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' },
  ipLabel: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  ipValue: { fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700', color: 'var(--accent)', marginBottom: '10px' },
  copyBtn: { background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: '600' },
  addBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600' },
  logoutBtn: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '8px', fontSize: '13px', marginTop: 'auto' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  mobileHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)'
  },
  hamburger: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '18px' },
  mobileTitle: { fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  emptyText: { color: 'var(--text-secondary)', fontSize: '15px' }
};
