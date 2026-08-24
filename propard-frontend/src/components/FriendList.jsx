import { useEffect, useState } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function FriendList({
  token,
  selectedFriend,
  onSelectFriend,
  hideFriendIps,
  setHideFriendIps,
  dragOverFriendId
}) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestUsers, setRequestUsers] = useState({});
  const [unread, setUnread] = useState({});

  const fetchUnread = async () => {
    try {
      const res = await axios.get('/api/friends/unread', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // On remplace complètement l'état par celui du serveur.
      // Cela évite de conserver d'anciens compteurs localement.
      setUnread(res.data || {});
    } catch (err) {
      console.error('Erreur récupération messages non lus:', err);
    }
  };

  const fetchData = async () => {
    try {
      const res = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const friendsList = res.data.friends || [];
      const requestsList = res.data.friendRequests || [];

      setFriends(friendsList);

      const validRequests = [];
      const usersMap = {};

      for (const req of requestsList) {
        try {
          const userRes = await axios.get(
            `/api/auth/user/${req.from}`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );

          usersMap[req.from] = userRes.data;
          validRequests.push(req);
        } catch {
          // Utilisateur supprimé, on ignore la demande.
        }
      }

      setRequests(validRequests);
      setRequestUsers(usersMap);
    } catch (err) {
      console.error('Erreur récupération données amis:', err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchUnread();

    const interval = setInterval(() => {
      fetchData();
      fetchUnread();
    }, 5000);

    return () => clearInterval(interval);
  }, [token]);

  /*
   * Gestion des nouveaux messages en temps réel.
   *
   * Si le message vient de la conversation actuellement ouverte :
   * - aucun badge ne doit apparaître ;
   * - le compteur local est remis à 0 ;
   * - le serveur est immédiatement informé que les messages sont lus.
   *
   * Sinon :
   * - on augmente le compteur de la personne qui vient d'envoyer le message.
   */
  useEffect(() => {
    const handleNew = async (msg) => {
      const senderId = (
        msg.sender?._id ||
        msg.sender
      )?.toString();

      if (!senderId) return;

      const selectedId = selectedFriend?._id?.toString();

      // Message reçu dans la conversation actuellement ouverte.
      if (selectedId === senderId) {
        setUnread(prev => ({
          ...prev,
          [senderId]: 0
        }));

        try {
          await axios.patch(
            `/api/friends/messages/read/${senderId}`,
            {},
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );
        } catch (err) {
          console.error(
            'Erreur marquage message comme lu:',
            err
          );
        }

        return;
      }

      // Message reçu dans une autre conversation.
      setUnread(prev => ({
        ...prev,
        [senderId]: (prev[senderId] || 0) + 1
      }));
    };

    socket.on('newMessage', handleNew);

    return () => {
      socket.off('newMessage', handleNew);
    };
  }, [selectedFriend, token]);

  const acceptRequest = async (fromUserId) => {
    try {
      await axios.post(
        '/api/friends/accept',
        { fromUserId },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      fetchData();
    } catch (err) {
      console.error('Erreur acceptation demande:', err);
    }
  };

  const declineRequest = async (fromUserId) => {
    try {
      await axios.post(
        '/api/friends/decline',
        { fromUserId },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      fetchData();
    } catch (err) {
      console.error('Erreur refus demande:', err);
    }
  };

  const handleSelect = async (friend) => {
    const friendId = friend?._id?.toString();

    if (!friendId) return;

    // Suppression immédiate du badge dans l'interface.
    setUnread(prev => ({
      ...prev,
      [friendId]: 0
    }));

    try {
      // Marque les messages comme lus côté serveur.
      await axios.patch(
        `/api/friends/messages/read/${friendId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
    } catch (err) {
      console.error(
        'Erreur marquage messages comme lus:',
        err
      );
    }

    window.history.pushState(
      {},
      '',
      `/chat/${friendId}`
    );

    onSelectFriend(friend);
  };

  return (
    <div style={styles.container}>
      {requests.length > 0 && (
        <div>
          <p style={styles.sectionTitle}>
            Demandes ({requests.length})
          </p>

          {requests.map(req => (
            <div
              key={req.from}
              style={styles.requestItem}
            >
              <p style={styles.requestName}>
                {requestUsers[req.from]?.username || '...'}
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '4px'
                }}
              >
                <button
                  style={styles.acceptBtn}
                  onClick={() =>
                    acceptRequest(req.from)
                  }
                >
                  ✓
                </button>

                <button
                  style={styles.declineBtn}
                  onClick={() =>
                    declineRequest(req.from)
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <p style={styles.sectionTitle}>
          Amis — {friends.length}
        </p>

        <button
          style={styles.hideIpBtn}
          onClick={() =>
            setHideFriendIps(!hideFriendIps)
          }
        >
          {hideFriendIps ? '👁️' : '🙈'}
        </button>
      </div>

      {friends.length === 0 && (
        <p style={styles.empty}>
          Ajoute ton premier ami !
        </p>
      )}

      {friends
        .filter(friend => friend.userId)
        .map(friend => {
          const friendId = friend.userId?._id?.toString();
          const unreadCount = unread[friendId] || 0;
          const isDropTarget =
            !!dragOverFriendId &&
            dragOverFriendId.toString() === friendId;

          return (
            <div
              key={friendId}
              data-friend-drop-zone="true"
              data-friend-id={friendId}
              style={{
                ...styles.friendItem,
                background: isDropTarget
                  ? 'var(--accent-glow)'
                  : selectedFriend?._id?.toString() === friendId
                    ? 'var(--bg-hover)'
                    : 'transparent',
                boxShadow: isDropTarget
                  ? '0 0 0 2px var(--accent)'
                  : 'none',
                transform: isDropTarget
                  ? 'scale(1.03)'
                  : 'scale(1)'
              }}
              onClick={() =>
                handleSelect(friend.userId)
              }
            >
              <div style={styles.avatar}>
                {(friend.userId?.username || '?')[0].toUpperCase()}
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0
                }}
              >
                <p style={styles.friendName}>
                  {friend.userId?.username}
                </p>

                <p style={styles.friendIp}>
                  {hideFriendIps
                    ? '███.███.███.███'
                    : friend.userId?.ipAlias}
                </p>
              </div>

              {isDropTarget ? (
                <div style={styles.dropHint}>📥</div>
              ) : unreadCount > 0 ? (
                <div style={styles.badge}>
                  <span style={styles.badgeIcon}>
                    💬
                  </span>

                  <span style={styles.badgeCount}>
                    {unreadCount}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    ...styles.dot,
                    background:
                      friend.userId?.isOnline
                        ? 'var(--success)'
                        : 'var(--text-muted)'
                  }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1
  },

  sectionTitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px',
    padding: '0 4px'
  },

  requestItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '8px',
    marginBottom: '4px',
    gap: '8px'
  },

  requestName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  acceptBtn: {
    background: 'var(--success)',
    color: '#fff',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '14px'
  },

  declineBtn: {
    background: 'var(--danger)',
    color: '#fff',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '14px'
  },

  friendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s'
  },

  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--accent)',
    flexShrink: 0
  },

  friendName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },

  friendIp: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)'
  },

  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },

  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    background: '#1a3a1a',
    border: '1px solid var(--success)',
    borderRadius: '12px',
    padding: '2px 7px',
    flexShrink: 0
  },

  badgeIcon: {
    fontSize: '11px'
  },

  badgeCount: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--success)'
  },

  dropHint: {
    fontSize: '16px',
    flexShrink: 0
  },

  hideIpBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '2px 4px',
    marginBottom: '6px'
  },

  empty: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    padding: '4px'
  }
};
