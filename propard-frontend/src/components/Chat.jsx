import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId, hideFriendIps }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

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

    socket.emit('sendMessage', {
      receiverId: friend._id,
      content: input.trim(),
    });

    setInput('');
  };

  return (
    <div style={styles.container}>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const senderId =
            msg.sender?._id?.toString?.() || msg.sender?.toString?.();

          const isMe = senderId === myId;

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: isMe ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)',
                }}
              >
                <p style={styles.text}>{msg.content}</p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div style={styles.inputBar}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          style={styles.input}
        />

        <button onClick={sendMessage} style={styles.btn}>➤</button>
      </div>
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  bubble: {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: 12,
  },

  text: {
    color: '#fff',
  },

  inputBar: {
    display: 'flex',
    padding: 16,
    gap: 8,
    borderTop: '1px solid var(--border)',
  },

  input: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--border)',
  },

  btn: {
    padding: '10px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 8,
  },
};
