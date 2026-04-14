import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId, hideFriendIps, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [spamWarning, setSpamWarning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const messageCount = useRef(0);
  const messageCountTimer = useRef(null);
  const longPressTimer = useRef(null); // Timer pour l'appui long mobile
  const SPAM_DELAY = 1000;
  const SPAM_LIMIT = 15;

  const normalize = (id) => id?.toString();
  const myId = normalize(userId);

  useEffect(() => {
    const fetchMessages = async () => {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/friends/messages/${friend._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(res.data);
    };
    fetchMessages();
  }, [friend._id]);

  useEffect(() => {
    const handleNew = (msg) => setMessages((prev) => [...prev, msg]);
    socket.on('newMessage', handleNew);
    socket.on('messageSent', handleNew);
    return () => {
      socket.off('newMessage', handleNew);
      socket.off('messageSent', handleNew);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Ferme le menu contextuel si on clique ailleurs
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('touchstart', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('touchstart', close);
    };
  }, []);

  const sendMessage = () => {
    if (!input.trim()) return;
    const now = Date.now();
    if (now - lastMessageTime.current < SPAM_DELAY) return;
    lastMessageTime.current = now;

    messageCount.current += 1;
    clearTimeout(messageCountTimer.current);
    messageCountTimer.current = setTimeout(() => { messageCount.current = 0; }, 10000);

    if (messageCount.current > SPAM_LIMIT) {
      setSpamWarning(true);
      setTimeout(() => setSpamWarning(false), 3000);
      return;
    }

    socket.emit('sendMessage', { receiverId: friend._id, content: input.trim() });
    setInput('');
  };

  const deleteMessage = async (msgId) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/friends/messages/${msgId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(prev => prev.map(m =>
        m._id === msgId ? { ...m, deleted: true, content: null } : m
      ));
    } catch (err) { console.error(err); }
  };

  const startEdit = (msg) => {
    setEditingId(msg._id);
    setEditContent(msg.content);
    setContextMenu(null);
  };

  const saveEdit = async (msgId) => {
    if (!editContent.trim()) return;
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/friends/messages/${msgId}`,
        { content: editContent.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(prev => prev.map(m =>
        m._id === msgId ? { ...m, content: editContent.trim(), edited: true } : m
      ));
      setEditingId(null);
      setEditContent('');
    } catch (err) { console.error(err); }
  };

  // ─── Calcule la position du menu pour qu'il reste dans l'écran ────────────
  const getMenuPosition = (x, y, isTouch = false) => {
    const menuWidth = 160;
    const menuHeight = 90;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top;

    if (isTouch) {
      // Sur mobile : centré horizontalement autour du point de toucher
      left = x - menuWidth / 2;
      top = y - menuHeight - 16; // Au-dessus du doigt
    } else {
      // Sur PC : à gauche du curseur
      left = x - menuWidth - margin;
      top = y;
    }

    // Empêche de sortir à gauche
    if (left < margin) left = margin;
    // Empêche de sortir à droite
    if (left + menuWidth > vw - margin) left = vw - menuWidth - margin;
    // Empêche de sortir en haut
    if (top < margin) top = margin;
    // Empêche de sortir en bas
    if (top + menuHeight > vh - margin) top = vh - menuHeight - margin;

    return { left, top };
  };

  // ─── Clic droit PC ────────────────────────────────────────────────────────
  const handleRightClick = (e, msg) => {
    const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
    if (senderId !== myId || msg.deleted) return;
    e.preventDefault();
    const pos = getMenuPosition(e.clientX, e.clientY, false);
    setContextMenu({ ...pos, msg });
  };

  // ─── Appui long mobile ────────────────────────────────────────────────────
  const handleTouchStart = (e, msg) => {
    const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
    if (senderId !== myId || msg.deleted) return;

    const touch = e.touches[0];
    const touchX = touch.clientX;
    const touchY = touch.clientY;

    longPressTimer.current = setTimeout(() => {
      e.preventDefault();
      const pos = getMenuPosition(touchX, touchY, true);
      setContextMenu({ ...pos, msg });
    }, 500); // 500ms = appui long
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  const handleTouchMove = () => {
    // Annule si le doigt bouge (scroll)
    clearTimeout(longPressTimer.current);
  };

  return (
    <div style={styles.container}>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerAvatar}>{friend.username[0].toUpperCase()}</div>
        <div>
          <p style={styles.headerName}>{friend.username}</p>
          <p style={styles.headerIp}>
            {hideFriendIps ? '███.███.███.███' : friend.ipAlias}
          </p>
        </div>
        <div style={{ ...styles.onlineDot, background: friend.isOnline ? 'var(--success)' : 'var(--text-muted)', marginLeft: 'auto' }} />
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.filter(msg => !msg.deleted).map((msg, i) => {
          const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
          const isMe = senderId === myId;

          return (
            <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div
                style={{ ...styles.bubble, background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)' }}
                onContextMenu={(e) => handleRightClick(e, msg)}
                onTouchStart={(e) => handleTouchStart(e, msg)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
              >
                {editingId === msg._id ? (
                  /* Mode édition */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      style={styles.editInput}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(msg._id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button style={styles.editBtn} onClick={() => saveEdit(msg._id)}>✓</button>
                      <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  </div>
                ) : (
                  /* Message normal */
                  <>
                    <p style={styles.text}>{msg.content}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                      {msg.edited && <p style={styles.editedLabel}>modifié</p>}
                      <p style={styles.msgTime}>
                        {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Menu contextuel */}
      {contextMenu && (
        <div
          style={{ ...styles.contextMenu, top: contextMenu.top, left: contextMenu.left }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <button style={styles.contextItem} onClick={() => { startEdit(contextMenu.msg); }}>
            ✏️ Modifier
          </button>
          <button style={{ ...styles.contextItem, color: 'var(--danger)' }}
            onClick={() => { deleteMessage(contextMenu.msg._id); setContextMenu(null); }}>
            🗑️ Supprimer
          </button>
        </div>
      )}

      {/* Avertissement spam */}
      {spamWarning && (
        <div style={styles.spamAlert}>⚠️ Envoie moins vite !</div>
      )}

      {/* Input */}
      <div style={styles.inputBar}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={`Message à ${friend.username}...`}
          style={styles.input}
        />
        <button onClick={sendMessage} style={styles.btn}>➤</button>
      </div>
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  headerAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--accent)', flexShrink: 0 },
  headerName: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  headerIp: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  onlineDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  bubble: { maxWidth: '65%', padding: '10px 14px', borderRadius: '12px', cursor: 'context-menu', userSelect: 'none', WebkitUserSelect: 'none' },
  text: { color: '#fff', fontSize: '14px', lineHeight: '1.4' },
  deletedText: { color: 'rgba(255,255,255,0.4)', fontSize: '13px', fontStyle: 'italic' },
  editedLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },
  msgTime: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' },
  editInput: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '14px', width: '100%' },
  editBtn: { background: 'var(--success)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '13px' },
  cancelBtn: { background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '13px' },
  contextMenu: { position: 'fixed', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', zIndex: 200, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minWidth: '150px' },
  contextItem: { background: 'transparent', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '14px', textAlign: 'left', cursor: 'pointer' },
  spamAlert: { textAlign: 'center', padding: '8px', color: 'var(--danger)', fontSize: '13px', fontWeight: '600', background: 'rgba(240, 91, 91, 0.1)', borderTop: '1px solid var(--danger)' },
  inputBar: { display: 'flex', padding: '16px', gap: '8px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  input: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '14px' },
  btn: { padding: '10px 14px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', fontSize: '16px' }
};
