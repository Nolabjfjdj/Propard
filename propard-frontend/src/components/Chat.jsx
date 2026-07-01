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

  // 🔥 FIX CALL
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

  // 🔥 CALL FIX
  useEffect(() => {
    const handleIncomingCall = ({ callerId, offer }) => {
      setCaller({ _id: callerId });
      setIncomingOffer(offer);
      setInCall(true);
    };

    socket.on('incomingCall', handleIncomingCall);

    return () => {
      socket.off('incomingCall', handleIncomingCall);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div style={styles.container}>

      {/* HEADER */}
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button style={styles.callBtn} onClick={() => setInCall(true)}>
            📞
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i}>{msg.content}</div>
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
        <button onClick={sendMessage} style={styles.btn}>➤</button>
      </div>

      {/* CALL */}
      {inCall && (
        <VoiceCall
          friend={caller || friend}
          userId={userId}
          onClose={() => {
            setInCall(false);
            setIncomingOffer(null);
            setCaller(null);
          }}
          incomingOffer={incomingOffer}
        />
      )}
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  header: { display: 'flex', alignItems: 'center', padding: 16 },
  headerAvatar: { width: 40, height: 40, borderRadius: '50%' },
  headerName: { fontWeight: 'bold' },
  headerIp: { fontSize: 12 },
  callBtn: { padding: 6, fontSize: 18 },
  messages: { flex: 1, overflowY: 'auto', padding: 16 },
  inputBar: { display: 'flex', padding: 16 },
  input: { flex: 1, padding: 10 },
  btn: { padding: 10 }
};