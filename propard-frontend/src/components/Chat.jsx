import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId, hideFriendIps }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  const normalize = (id) => id?.toString?.() || id;

  const myId = normalize(userId);
  const friendId = normalize(friend._id);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/friends/messages/${friend._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessages(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchMessages();
  }, [friend._id, token]);

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

    socket.emit('sendMessage', {
      receiverId: friendId,
      content: input.trim()
    });

    setInput('');
  };

  return (
    <div style={styles.container}>

      <div style={styles.header}>
        <div style={styles.avatar}>
          {friend.username[0].toUpperCase()}
        </div>

        <div>
          <div style={styles.name}>{friend.username}</div>
          <div style={styles.ip}>
            {hideFriendIps ? '███.███.███.███' : friend.ipAlias}
          </div>
        </div>
      </div>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const senderId = normalize(msg.sender?._id || msg.sender);

          const isMe = senderId === myId;

          return (
            <div
              key={msg._id || i}
              style={{
                display: 'flex',
                justifyContent: isMe ? 'flex-end' : 'flex-start'
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: isMe
                    ? 'var(--accent)'
                    : 'var(--bg-tertiary)'
                }}
              >
                <div style={styles.text}>{msg.content}</div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div style={styles.inputBar}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Message..."
        />

        <button style={styles.send} onClick={sendMessage}>
          ➤
        </button>
      </div>
    </div>
  );
}

/* ========== STYLES ========== */

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)'
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 700
  },

  name: {
    fontWeight: 600,
    color: 'var(--text-primary)'
  },

  ip: {
    fontSize: 11,
    color: 'var(--text-muted)',
    fontFamily: 'monospace'
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },

  bubble: {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: 12
  },

  text: {
    fontSize: 14,
    color: '#fff'
  },

  inputBar: {
    display: 'flex',
    gap: 8,
    padding: 16,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)'
  },

  input: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)'
  },

  send: {
    padding: '12px 16px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff'
  }
};
