import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';

export default function Chat({ friend, token, userId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    const fetch = async () => {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/friends/messages/${friend._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(res.data);
    };
    fetch();
  }, [friend._id]);

  useEffect(() => {
    const handle = (msg) => setMessages(prev => [...prev, msg]);

    socket.on('newMessage', handle);
    socket.on('messageSent', handle);

    return () => {
      socket.off('newMessage', handle);
      socket.off('messageSent', handle);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;

    socket.emit('sendMessage', {
      receiverId: friend._id,
      content: input
    });

    setInput('');
  };

  return (
    <div style={styles.container}>

      <div style={styles.messages}>
        {messages.map((m, i) => {

          const senderId =
            typeof m.sender === 'object'
              ? m.sender._id
              : m.sender;

          const isMe = senderId === userId;

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: isMe ? 'flex-end' : 'flex-start'
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: isMe ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: isMe ? 'white' : 'var(--text-primary)'
                }}
              >
                {m.content}
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
          style={styles.input}
          placeholder="Message..."
        />

        <button onClick={send} style={styles.sendBtn}>
          ➤
        </button>
      </div>
    </div>
  );
}

/* ===================== STYLES ===================== */

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },

  messages: {
    flex: 1,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto'
  },

  bubble: {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: 12
  },

  inputBar: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '1px solid var(--border)'
  },

  input: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border)'
  },

  sendBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'white',
    border: 'none'
  }
};
