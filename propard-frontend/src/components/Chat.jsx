import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import VoiceCall from './VoiceCall';

export default function Chat({ friend, token, userId, hideFriendIps, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [spamWarning, setSpamWarning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [caller, setCaller] = useState(null);

  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const messageCount = useRef(0);
  const messageCountTimer = useRef(null);
  const longPressTimer = useRef(null);
  const SPAM_DELAY = 1000;
  const SPAM_LIMIT = 15;

  const normalize = (id) => id?.toString();
  const myId = normalize(userId);

  useEffect(() => {
    const fetchMessages = async () => {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/friends/messages/${friend._id}`, { headers: { Authorization: `Bearer ${token}` } });
      setMessages(res.data);
      await axios.patch(`${import.meta.env.VITE_API_URL}/api/friends/messages/read/${friend._id}`, {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    };
    fetchMessages();
  }, [friend._id]);

  useEffect(() => {
    const handleNew = (msg) => setMessages((prev) => [...prev, msg]);
    socket.on('newMessage', handleNew);
    socket.on('messageSent', handleNew);
    socket.on('incomingCall', ({ callerId, offer }) => {
      setCaller({ _id: callerId });
      setIncomingOffer(offer);
      setInCall(true);
    });
    return () => {
      socket.off('newMessage', handleNew);
      socket.off('messageSent', handleNew);
      socket.off('incomingCall');
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const deleteMessage = async (msgId) => {
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/friends/messages/${msgId}`, { headers: { Authorization: `Bearer ${token}` } });
      setMessages(prev => prev.map(m => m._id === msgId ? { ...m, deleted: true, content: null } : m));
    } catch (err) { console.error(err); }
  };

  const saveEdit = async (msgId) => {
    if (!editContent.trim()) return;
    try {
      await axios.patch(`${import.meta.env.VITE_API_URL}/api/friends/messages/${msgId}`, { content: editContent.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setMessages(prev => prev.map(m => m._id === msgId ? { ...m, content: editContent.trim(), edited: true } : m));
      setEditingId(null);
      setEditContent('');
    } catch (err) { console.error(err); }
  };

  const handleRightClick = (e, msg) => {
    const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
    if (senderId !== myId || msg.deleted) return;
    e.preventDefault();
    setContextMenu({ left: e.clientX, top: e.clientY, msg });
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const now = Date.now();
    if (now - lastMessageTime.current < SPAM_DELAY) return;
    lastMessageTime.current = now;
    if (++messageCount.current > SPAM_LIMIT) {
      setSpamWarning(true);
      setTimeout(() => setSpamWarning(false), 3000);
      return;
    }
    socket.emit('sendMessage', { receiverId: friend._id, content: input.trim() });
    setInput('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerAvatar}>{friend.username[0].toUpperCase()}</div>
        <div>
          <p style={styles.headerName}>{friend.username}</p>
          <p style={styles.headerIp}>{hideFriendIps ? '███.███.███.███' : friend.ipAlias}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={styles.callBtn} onClick={() => setInCall(true)}>📞</button>
          <div style={{ ...styles.onlineDot, background: friend.isOnline ? 'var(--success)' : 'var(--text-muted)' }} />
        </div>
      </div>

      <div style={styles.messages}>
        {messages.filter(msg => !msg.deleted).map((msg, i) => {
          const isMe = (msg.sender?._id?.toString?.() || msg.sender?.toString?.()) === myId;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)' }} onContextMenu={(e) => handleRightClick(e, msg)}>
                {editingId === msg._id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input style={styles.editInput} value={editContent} onChange={e => setEditContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit(msg._id)} autoFocus />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button style={styles.editBtn} onClick={() => saveEdit(msg._id)}>✓</button>
                      <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={styles.text}>{msg.content}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', alignItems: 'center' }}>
                        {msg.edited && <p style={styles.editedLabel}>modifié</p>}
                        <p style={styles.msgTime}>{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {contextMenu && (
        <div style={{ ...styles.contextMenu, top: contextMenu.top, left: contextMenu.left }} onClick={() => setContextMenu(null)}>
          <button style={styles.contextItem} onClick={() => { setEditingId(contextMenu.msg._id); setEditContent(contextMenu.msg.content); }}>✏️ Modifier</button>
          <button style={{ ...styles.contextItem, color: 'var(--danger)' }} onClick={() => deleteMessage(contextMenu.msg._id)}>🗑️ Supprimer</button>
        </div>
      )}

      {spamWarning && <div style={styles.spamAlert}>⚠️ Envoie moins vite !</div>}

      <div style={styles.inputBar}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={`Message à ${friend.username}...`} style={styles.input} />
        <button onClick={sendMessage} style={styles.btn}>➤</button>
      </div>

      {inCall && (
        <VoiceCall friend={caller || friend} userId={userId} onClose={() => { setInCall(false); setIncomingOffer(null); setCaller(null); }} incomingOffer={incomingOffer} />
      )}
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
  callBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px', cursor: 'pointer' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  bubble: { maxWidth: '65%', padding: '10px 14px', borderRadius: '12px', cursor: 'context-menu', userSelect: 'none' },
  text: { color: '#fff', fontSize: '14px', lineHeight: '1.4', margin: 0 },
  editedLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: 0 },
  msgTime: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', margin: 0 },
  editInput: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '14px', width: '100%' },
  editBtn: { background: 'var(--success)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '13px', cursor: 'pointer' },
  cancelBtn: { background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '13px', cursor: 'pointer' },
  contextMenu: { position: 'fixed', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minWidth: '150px' },
  contextItem: { background: 'transparent', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '14px', textAlign: 'left', cursor: 'pointer', border: 'none' },
  spamAlert: { textAlign: 'center', padding: '8px', color: 'var(--danger)', fontSize: '13px', fontWeight: '600', background: 'rgba(240, 91, 91, 0.1)', borderTop: '1px solid var(--danger)' },
  inputBar: { display: 'flex', padding: '16px', gap: '8px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  input: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '14px' },
  btn: { padding: '10px 14px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', fontSize: '16px', border: 'none', cursor: 'pointer' }
};
