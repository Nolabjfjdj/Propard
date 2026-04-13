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

  useEffect(() => {
    socket.connect();
    socket.emit('authenticate', token);
    return () => socket.disconnect();
  }, [token]);

  return (
    <div style={styles.layout}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.appName}>Propard<span style={{ color: 'var(--accent)' }}>.</span></span>
          <button onClick={toggleTheme} style={styles.iconBtn}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>

        <div style={styles.ipCard}>
          <p style={styles.ipLabel}>Ton adresse</p>
          <p style={styles.ipValue}>{user?.ipAlias}</p>
          <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(user?.ipAlias)}>
            📋 Copier
          </button>
        </div>

        <button style={styles.addBtn} onClick={() => setShowAddFriend(true)}>+ Ajouter un ami</button>

        <FriendList token={token} selectedFriend={selectedFriend} onSelectFriend={setSelectedFriend} />

        <button style={styles.logoutBtn} onClick={logout}>Déconnexion</button>
      </div>

      <div style={styles.main}>
        {selectedFriend ? (
          <Chat friend={selectedFriend} token={token} userId={user?.id} />
        ) : (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>💬</p>
            <p style={styles.emptyText}>Sélectionne un ami pour chatter</p>
          </div>
        )}
      </div>

      {showAddFriend && <AddFriend token={token} onClose={() => setShowAddFriend(false)} />}
    </div>
  );
}

const styles = {
  layout: { display: 'flex', height: '100vh', background: 'var(--bg-primary)' },
  sidebar: { width: '280px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflowY: 'auto' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: '700' },
  iconBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px' },
  ipCard: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' },
  ipLabel: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  ipValue: { fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700', color: 'var(--accent)', marginBottom: '10px' },
  copyBtn: { background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: '600' },
  addBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600' },
  logoutBtn: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '8px', fontSize: '13px', marginTop: 'auto' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  emptyText: { color: 'var(--text-secondary)', fontSize: '15px' }
};