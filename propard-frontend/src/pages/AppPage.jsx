import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import socket from '../socket';
import FriendList from '../components/FriendList';
import Chat from '../components/Chat';
import AddFriend from '../components/AddFriend';
import VoiceCall from '../components/VoiceCall';

export default function AppPage({ initialFriendId }) {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [hideIp, setHideIp] = useState(() => localStorage.getItem('propard_hideIp') === 'true');
  const [hideFriendIps, setHideFriendIps] = useState(() => localStorage.getItem('propard_hideFriendIps') === 'true');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [friendNotFound, setFriendNotFound] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    socket.connect();
    socket.emit('authenticate', token);
    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!initialFriendId || !token) return;
    const loadInitialFriend = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const friends = res.data.friends || [];
        const match = friends.find(f => f.userId?._id === initialFriendId);
        if (match) {
          setSelectedFriend(match.userId);
        } else {
          setFriendNotFound(true);
        }
      } catch (err) { console.error(err); }
    };
    loadInitialFriend();
  }, [initialFriendId, token]);

  useEffect(() => {
    socket.on('incomingCall', async ({ callerId, offer }) => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/auth/user/${callerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setIncomingCall({ friend: { ...res.data, _id: callerId }, offer });
      } catch (err) { console.error(err); }
    });
    return () => socket.off('incomingCall');
  }, [token]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    window.history.pushState({}, '', `/chat/${friend._id}`);
    if (isMobile) setShowSidebar(false);
  };

  const handleBack = () => {
    setSelectedFriend(null);
    setFriendNotFound(false);
    window.history.pushState({}, '', '/');
  };

  return (
    <div style={styles.layout}>

      {isMobile && showSidebar && (
        <div style={styles.overlay} onClick={() => setShowSidebar(false)} />
      )}

      <div style={{
        ...styles.sidebar,
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : 'auto',
        left: isMobile ? 0 : 'auto',
        bottom: isMobile ? 0 : 'auto',
        transform: isMobile
          ? (showSidebar ? 'translateX(0)' : 'translateX(-100%)')
          : 'translateX(0)'
      }}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <a href="/help" style={styles.helpLink}>help</a>
            <span style={styles.appName}>
              Propard<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <a
              href="https://discord.gg/hsMdJQz6EY"
              target="_blank"
              rel="noreferrer"
              style={styles.discordLink}
            >
              Discord
            </a>
            <button onClick={toggleTheme} style={styles.iconBtn}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {isMobile && (
              <button onClick={() => setShowSidebar(false)} style={styles.iconBtn}>✕</button>
            )}
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

        <button style={styles.logoutBtn} onClick={logout}>Déconnexion</button>
      </div>

      <div style={styles.main}>

        {isMobile && !selectedFriend && !friendNotFound && (
          <div style={styles.mobileHeader}>
            <button style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
            <span style={styles.mobileTitle}>Propard</span>
            <div style={{ width: '36px' }} />
          </div>
        )}

        {isMobile && (selectedFriend || friendNotFound) && (
          <div style={styles.mobileHeader}>
            <button style={styles.hamburger} onClick={handleBack}>←</button>
            <div style={{ width: '36px' }} />
          </div>
        )}

        {selectedFriend ? (
          <Chat
            friend={selectedFriend}
            token={token}
            userId={user?.id}
            hideFriendIps={hideFriendIps}
            isMobile={isMobile}
          />
        ) : friendNotFound ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>🚫</p>
            <p style={styles.emptyText}>Tu n'as pas cet ami</p>
            <button style={styles.backBtn} onClick={handleBack}>Retour</button>
          </div>
        ) : (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>💬</p>
            <p style={styles.emptyText}>
              {isMobile ? 'Appuie sur ☰ pour voir tes amis' : 'Sélectionne un ami pour chatter'}
            </p>
          </div>
        )}
      </div>

      {showAddFriend && (
        <AddFriend token={token} onClose={() => setShowAddFriend(false)} />
      )}

      {incomingCall && (
        <VoiceCall
          friend={incomingCall.friend}
          userId={user?.id}
          onClose={() => setIncomingCall(null)}
          incomingOffer={incomingCall.offer}
        />
      )}
    </div>
  );
}

const styles = {
  layout: { display: 'flex', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 },
  sidebar: { width: '280px', flexShrink: 0, zIndex: 100, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflowY: 'auto', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', transition: 'transform 0.25s ease' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: '700' },
  helpLink: { fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '2px' },
  discordLink: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center' },
  iconBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px' },
  ipCard: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' },
  ipLabel: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  ipValue: { fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700', color: 'var(--accent)', marginBottom: '10px' },
  copyBtn: { background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: '600' },
  addBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600' },
  logoutBtn: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '8px', fontSize: '13px', marginTop: 'auto' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  mobileHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' },
  hamburger: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '18px' },
  mobileTitle: { fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  emptyText: { color: 'var(--text-secondary)', fontSize: '15px' },
  backBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', border: 'none', cursor: 'pointer', marginTop: '8px' }
};
