import { useEffect, useState } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function FriendList({ token, selectedFriend, onSelectFriend, hideFriendIps, setHideFriendIps }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [unread, setUnread] = useState({});

  const fetchData = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(res.data.friends || []);
      setRequests(res.data.friendRequests || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const handleNew = (msg) => {
      const senderId = msg.sender._id || msg.sender;
      setUnread(prev => ({
        ...prev,
        [senderId]: (prev[senderId] || 0) + 1
      }));
    };
    socket.on('newMessage', handleNew);
    return () => socket.off('newMessage', handleNew);
  }, []);

  const acceptRequest = async (fromUserId) => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/friends/accept`,
        { fromUserId }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleSelect = (friend) => {
    setUnread(prev => ({ ...prev, [friend._id]: 0 }));
    onSelectFriend(friend);
  };

  return (
    <div style={styles.container}>
      {requests.length > 0 && (
        <div>
          <p style={styles.sectionTitle}>Demandes ({requests.length})</p>
          {requests.map(req => (
            <div key={req.from} style={styles.requestItem}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Nouveau</span>
              <button style={styles.acceptBtn} onClick={() => acceptRequest(req.from)}>✓</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={styles.sectionTitle}>Amis — {friends.length}</p>
        <button style={styles.hideIpBtn} onClick={() => setHideFriendIps(!hideFriendIps)}>
          {hideFriendIps ? '👁️' : '🙈'}
        </button>
      </div>

      {friends.length === 0 && <p style={styles.empty}>Ajoute ton premier ami !</p>}

      {friends.map(friend => (
        <div key={friend.userId?._id}
          style={{ ...styles.friendItem, background: selectedFriend?._id === friend.userId?._id ? 'var(--bg-hover)' : 'transparent' }}
          onClick={() => handleSelect(friend.userId)}>
          <div style={styles.avatar}>{(friend.nickname || friend.userId?.username || '?')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.friendName}>{friend.nickname || friend.userId?.username}</p>
            <p style={styles.friendIp}>
              {hideFriendIps ? '███.███.███.███' : friend.userId?.ipAlias}
            </p>
          </div>
          {unread[friend.userId?._id] > 0 ? (
            <div style={styles.badge}>
              <span style={styles.badgeIcon}>💬</span>
              <span style={styles.badgeCount}>{unread[friend.userId?._id]}</span>
            </div>
          ) : (
            <div style={{ ...styles.dot, background: friend.userId?.isOnline ? 'var(--success)' : 'var(--text-muted)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
  sectionTitle: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', padding: '0 4px' },
  requestItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '4px' },
  acceptBtn: { background: 'var(--success)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '14px' },
  friendItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: 'var(--accent)', flexShrink: 0 },
  friendName: { fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  friendIp: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  badge: { display: 'flex', alignItems: 'center', gap: '3px', background: '#1a3a1a', border: '1px solid var(--success)', borderRadius: '12px', padding: '2px 7px', flexShrink: 0 },
  badgeIcon: { fontSize: '11px' },
  badgeCount: { fontSize: '11px', fontWeight: '700', color: 'var(--success)' },
  hideIpBtn: { background: 'transparent', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '2px 4px', marginBottom: '6px' },
  empty: { fontSize: '13px', color: 'var(--text-muted)', padding: '4px' }
};
