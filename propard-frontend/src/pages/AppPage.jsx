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
  const [showSidebar, setShowSidebar] = useState(false);

  const [hideIp, setHideIp] = useState(() =>
    localStorage.getItem('propard_hideIp') === 'true'
  );

  const [hideFriendIps, setHideFriendIps] = useState(() =>
    localStorage.getItem('propard_hideFriendIps') === 'true'
  );

  const [isMobile, setIsMobile] = useState(false);

  // responsive
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // socket
  useEffect(() => {
    if (!token) return;

    socket.connect();
    socket.emit('authenticate', token);

    return () => socket.disconnect();
  }, [token]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    if (isMobile) setShowSidebar(false);
  };

  return (
    <div style={styles.layout}>

      {/* overlay mobile */}
      {isMobile && showSidebar && (
        <div style={styles.overlay} onClick={() => setShowSidebar(false)} />
      )}

      {/* SIDEBAR */}
      <div
        style={{
          ...styles.sidebar,
          transform: isMobile
            ? (showSidebar ? 'translateX(0)' : 'translateX(-100%)')
            : 'translateX(0)'
        }}
      >
        <div style={styles.sidebarHeader}>
          <span style={styles.appName}>
            Propard<span style={{ color: 'var(--accent)' }}>.</span>
          </span>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleTheme} style={styles.iconBtn}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {isMobile && (
              <button onClick={() => setShowSidebar(false)} style={styles.iconBtn}>
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={styles.ipCard}>
          <p style={styles.ipLabel}>Ton adresse</p>
          <p style={styles.ipValue}>
            {hideIp ? '███.███.███.███' : user?.ipAlias}
          </p>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button
              style={styles.copyBtn}
              onClick={() => navigator.clipboard.writeText(user?.ipAlias)}
            >
              📋 Copier
            </button>

            <button
              style={styles.copyBtn}
              onClick={() => {
                const next = !hideIp;
                setHideIp(next);
                localStorage.setItem('propard_hideIp', next);
              }}
            >
              {hideIp ? '👁️ Afficher' : '🙈 Masquer'}
            </button>
          </div>
        </div>

        <button style={styles.addBtn} onClick={() => setShowAddFriend(true)}>
          + Ajouter un ami
        </button>

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

        <button style={styles.logoutBtn} onClick={logout}>
          Déconnexion
        </button>
      </div>

      {/* MAIN */}
      <div style={styles.main(isMobile)}>

        {isMobile && (
          <div style={styles.mobileHeader}>
            <button
              style={styles.hamburger}
              onClick={() => setShowSidebar(true)}
            >
              ☰
            </button>

            <span style={styles.mobileTitle}>
              {selectedFriend ? selectedFriend.username : 'Propard'}
            </span>

            <div style={{ width: 36 }} />
          </div>
        )}

        {selectedFriend ? (
          <Chat
            friend={selectedFriend}
            token={token}
            userId={user?._id}   // 🔥 FIX IMPORTANT
            hideFriendIps={hideFriendIps}
          />
        ) : (
          <div style={styles.empty}>
            <p style={{ fontSize: 48 }}>💬</p>
            <p>
              {isMobile
                ? 'Appuie sur ☰ pour voir tes amis'
                : 'Choisis un ami à gauche'}
            </p>
          </div>
        )}
      </div>

      {showAddFriend && (
        <AddFriend token={token} onClose={() => setShowAddFriend(false)} />
      )}
    </div>
  );
}

/* ================= STYLES ================= */

const styles = {
  layout: {
    display: 'flex',
    height: '100vh',
    background: 'var(--bg-primary)',
    overflow: 'hidden'
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 99
  },

  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
    gap: 12,
    overflowY: 'auto',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    transition: 'transform 0.25s ease'
  },

  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  appName: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: 'monospace'
  },

  iconBtn: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)'
  },

  ipCard: {
    padding: 14,
    borderRadius: 10,
    background: 'var(--bg-tertiary)',
    textAlign: 'center'
  },

  ipLabel: { fontSize: 11, color: 'var(--text-muted)' },

  ipValue: {
    fontSize: 16,
    color: 'var(--accent)',
    fontFamily: 'monospace'
  },

  copyBtn: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    padding: '5px 12px'
  },

  addBtn: {
    background: 'var(--accent)',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    fontWeight: 600
  },

  logoutBtn: {
    marginTop: 'auto',
    border: '1px solid red',
    color: 'red',
    background: 'transparent',
    padding: 8,
    borderRadius: 8
  },

  main: (isMobile) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    marginLeft: isMobile ? 0 : 280,
    width: '100%'
  }),

  mobileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: 12,
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)'
  },

  hamburger: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)'
  },

  mobileTitle: {
    fontFamily: 'monospace',
    fontWeight: 700
  },

  empty: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10
  }
};
