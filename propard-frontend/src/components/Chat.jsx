import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId, hideFriendIps, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const SPAM_DELAY = 1000;

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
    const handleNew = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };
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

  const sendMessage = () => {
    if (!input.trim()) return;
    const now = Date.now();
    if (now - lastMessageTime.current < SPAM_DELAY) return;
    lastMessageTime.current = now;
    socket.emit('sendMessage', { receiverId: friend._id, content: input.trim() });
    setInput('');
  };

  return (
    <div style={styles.container}>

      {/* Header — caché sur mobile car pseudo déjà affiché en haut */}
      {!isMobile && (
        <div style={styles.header}>
          <div style={styles.headerAvatar}>
            {friend.username[0].toUpperCase()}
          </div>
          <div>
            <p style={styles.headerName}>{friend.username}</p>
            <p style={styles.headerIp}>
              {hideFriendIps ? '███.███.███.███' : friend.ipAlias}
            </p>
          </div>
          <div style={{
            ...styles.onlineDot,
            background: friend.isOnline ? 'var(--success)' : 'var(--text-muted)',
            marginLeft: 'auto'
          }} />
        </div>
      )}

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
          const isMe = senderId === myId;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)' }}>
                <p style={styles.text}>{msg.content}</p>
                <p style={styles.msgTime}>
                  {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

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
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  headerAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--accent)', flexShrink: 0 },
  headerName: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  headerIp: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  onlineDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  bubble: { maxWidth: '65%', padding: '10px 14px', borderRadius: '12px' },
  text: { color: '#fff', fontSize: '14px', lineHeight: '1.4' },
  msgTime: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', textAlign: 'right' },
  inputBar: { display: 'flex', padding: '16px', gap: '8px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  input: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '14px' },
  btn: { padding: '10px 14px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', fontSize: '16px' }
};
