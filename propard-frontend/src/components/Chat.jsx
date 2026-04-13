import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/friends/messages/${friend._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessages(res.data);
      } catch (err) { console.error(err); }
    };
    fetchMessages();
  }, [friend._id, token]);

  useEffect(() => {
    const handleNew = (msg) => {
      if (msg.sender._id === friend._id || msg.receiver === friend._id) {
        setMessages(prev => [...prev, msg]);
      }
    };
    socket.on('newMessage', handleNew);
    socket.on('messageSent', handleNew);
    return () => { socket.off('newMessage', handleNew); socket.off('messageSent', handleNew); };
  }, [friend._id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit('sendMessage', { receiverId: friend._id, content: input.trim() });
    setInput('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerAvatar}>{friend.username[0].toUpperCase()}</div>
        <div>
          <p style={styles.headerName}>{friend.username}</p>
          <p style={styles.headerIp}>{friend.ipAlias}</p>
        </div>
        <div style={{ ...styles.onlineDot, background: friend.isOnline ? 'var(--success)' : 'var(--text-muted)', marginLeft: 'auto' }} />
      </div>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const isMe = msg.sender._id === userId || msg.sender === userId;
          return (
            <div key={msg._id || i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)' }}>
                <p style={styles.msgContent}>{msg.content}</p>
                <p style={styles.msgTime}>
                  {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputBar}>
        <input style={styles.input} placeholder={`Message à ${friend.username}...`}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()} />
        <button style={styles.sendBtn} onClick={sendMessage}>➤</button>
      </div>
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' },
  headerAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--accent)' },
  headerName: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  headerIp: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  onlineDot: { width: '10px', height: '10px', borderRadius: '50%' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  bubble: { maxWidth: '65%', borderRadius: '12px', padding: '10px 14px' },
  msgContent: { fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.4' },
  msgTime: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', textAlign: 'right' },
  inputBar: { display: 'flex', gap: '8px', padding: '16px 20px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' },
  input: { flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px' },
  sendBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '12px 16px', fontSize: '16px' }
};