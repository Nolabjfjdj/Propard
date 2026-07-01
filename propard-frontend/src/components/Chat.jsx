import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import VoiceCall from './VoiceCall';

export default function Chat({ friend, token, userId, hideFriendIps, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [spamWarning, setSpamWarning] = useState(false);
  const [inCall, setInCall] = useState(false);

  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const messageCount = useRef(0);
  const messageCountTimer = useRef(null);

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

      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/friends/messages/read/${friend._id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {});
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

  const sendMessage = () => {
    if (!input.trim()) return;

    const now = Date.now();
    if (now - lastMessageTime.current < SPAM_DELAY) return;
    lastMessageTime.current = now;

    messageCount.current += 1;
    clearTimeout(messageCountTimer.current);
    messageCountTimer.current = setTimeout(() => {
      messageCount.current = 0;
    }, 10000);

    if (messageCount.current > SPAM_LIMIT) {
      setSpamWarning(true);
      setTimeout(() => setSpamWarning(false), 3000);
      return;
    }

    socket.emit('sendMessage', {
      receiverId: friend._id,
      content: input.trim()
    });

    setInput('');
  };

  const isMe = (msg) => {
    const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.();
    return senderId === myId;
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.avatar}>
          {friend.username[0].toUpperCase()}
        </div>

        <div style={{ flex: 1 }}>
          <p style={styles.name}>{friend.username}</p>
          <p style={styles.ip}>
            {hideFriendIps ? '███.███.███.███' : friend.ipAlias}
          </p>
        </div>

        <button style={styles.callBtn} onClick={() => setInCall(true)}>
          📞
        </button>
      </div>

      {/* MESSAGES */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: isMe(msg) ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                ...styles.bubble,
                background: isMe(msg)
                  ? 'linear-gradient(135deg, #6d5efc, #3dd6d0)'
                  : 'rgba(255,255,255,0.08)'
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div style={styles.inputBar}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={`Message à ${friend.username}...`}
          style={styles.input}
        />

        <button onClick={sendMessage} style={styles.sendBtn}>
          ➤
        </button>
      </div>

      {/* SPAM WARNING */}
      {spamWarning && (
        <div style={styles.warning}>
          ⚠️ Envoie moins vite
        </div>
      )}

      {/* CALL */}
      {inCall && (
        <VoiceCall
          friend={friend}
          userId={userId}
          onClose={() => setInCall(false)}
          incomingOffer={null}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #0b0f17, #0f1624)',
    color: '#fff',
    fontFamily: 'system-ui'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.08)'
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6d5efc, #3dd6d0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold'
  },

  name: {
    margin: 0,
    fontWeight: 700
  },

  ip: {
    margin: 0,
    fontSize: 11,
    opacity: 0.6
  },

  callBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#fff',
    cursor: 'pointer'
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },

  bubble: {
    maxWidth: '70%',
    padding: '10px 14px',
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 1.4,
    color: '#fff'
  },

  inputBar: {
    display: 'flex',
    gap: 10,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    borderTop: '1px solid rgba(255,255,255,0.08)'
  },

  input: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    outline: 'none'
  },

  sendBtn: {
    padding: '12px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #6d5efc, #3dd6d0)',
    color: '#fff',
    cursor: 'pointer'
  },

  warning: {
    textAlign: 'center',
    padding: 8,
    color: '#ff4d4d',
    fontWeight: 600,
    background: 'rgba(255,0,0,0.08)'
  }
};