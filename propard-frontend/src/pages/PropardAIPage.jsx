import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import VoiceMode from '../components/VoiceMode';
import VoiceDictationButton from '../components/VoiceDictationButton';
import { useAuth } from '../context/AuthContext';
import socket from '../socket';
import {
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  getStoredPrivateKeyJwk
} from '../utils/crypto';
import {
  decryptGroupKeyPackage,
  getStoredGroupKey,
  storeGroupKey
} from '../utils/groupCrypto';

const auth = token => ({ headers: { Authorization: `Bearer ${token}` } });

const updateConversationUrl = id => {
  const nextPath = id ? `/ai/${encodeURIComponent(id)}` : '/ai';
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

export default function PropardAIPage({ initialConversationId = null }) {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(null);
  const [keyCount, setKeyCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [pendingRead, setPendingRead] = useState(null);
  const [localReadResult, setLocalReadResult] = useState(null);
  const [readingLocal, setReadingLocal] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const response = await api.get('/api/ai/conversations', auth(token));
    setConversations(response.data || []);
    return response.data || [];
  }, [token]);

  const openConversation = useCallback(id => {
    setError('');
    setSidebarOpen(false);
    if (id === activeId) return;
    setActiveId(id);
    setMessages([]);
    setLoading(true);
    updateConversationUrl(id);
  }, [activeId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/api/ai/status', auth(token)),
      api.get('/api/ai/conversations', auth(token))
    ]).then(async ([status, list]) => {
      if (!mounted) return;
      setAvailable(status.data.available);
      setKeyCount(status.data.keyCount || 0);
      setConversations(list.data || []);
      const conversationId = initialConversationId || list.data?.[0]?.id || null;
      if (!conversationId) {
        setActiveId(null);
        setMessages([]);
        updateConversationUrl(null);
        return;
      }
      setActiveId(conversationId);
      if (!initialConversationId) updateConversationUrl(conversationId);
      try {
        const result = await api.get(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, auth(token));
        if (mounted) setMessages(result.data.messages || []);
      } catch (err) {
        if (mounted) {
          setMessages([]);
          setError(err.response?.data?.error || 'Impossible de charger cette conversation.');
        }
      }
    }).catch(err => {
      if (mounted) setError(err.response?.data?.error || 'Impossible de contacter Propard AI.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [token, initialConversationId]);

  useEffect(() => {
    if (!token) return undefined;
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!pendingRead || !token || !user) return;
    let cancelled = false;
    const readLatestMessageLocally = async () => {
      setReadingLocal(true);
      setLocalReadResult(null);
      try {
        const userId = (user.id || user._id)?.toString();
        if (!userId) throw new Error('Compte utilisateur introuvable.');
        const privateKey = await getStoredPrivateKeyJwk(userId);
        if (!privateKey) throw new Error('Clé privée E2EE locale introuvable.');

        let response;
        let plaintext = null;
        if (pendingRead.type === 'private_message') {
          const profileResponse = await api.get(
            `/api/auth/user/${encodeURIComponent(pendingRead.conversationId)}`,
            auth(token)
          );
          const publicKeyValue = profileResponse.data?.publicKey;
          const publicKey = typeof publicKeyValue === 'string' ? JSON.parse(publicKeyValue) : publicKeyValue;
          if (!publicKey) throw new Error('Clé publique de cet ami indisponible.');
          const sharedKey = await deriveSharedKey(privateKey, publicKey);
          response = await api.get(
            `/api/friends/messages/${encodeURIComponent(pendingRead.conversationId)}?limit=1&direction=${pendingRead.direction === 'sent' ? 'sent' : 'received'}`,
            auth(token)
          );
          const latest = Array.isArray(response.data) ? response.data[0] : null;
          if (!latest) throw new Error('Aucun message dans cette conversation.');
          if (latest.encrypted === false) plaintext = latest.content || '';
          else plaintext = await decryptMessage(sharedKey, latest.content);
        } else if (pendingRead.type === 'group_message') {
          const groupResponse = await api.get(
            `/api/groups/${encodeURIComponent(pendingRead.conversationId)}`,
            auth(token)
          );
          const group = groupResponse.data;
          const currentVersion = group.keyVersion || 1;
          let groupKey = await getStoredGroupKey(group._id, currentVersion);
          if (!groupKey) {
            const keyPackage = group.keyPackage;
            if (!keyPackage?.encryptedKey || !keyPackage?.senderId) {
              throw new Error('Clé du groupe introuvable sur cet appareil.');
            }
            const senderId = keyPackage.senderId.toString();
            const senderPublicKeyValue = keyPackage.senderPublicKey || group.members?.find(member => member._id?.toString() === senderId)?.publicKey;
            const senderPublicKey = typeof senderPublicKeyValue === 'string' ? JSON.parse(senderPublicKeyValue) : senderPublicKeyValue;
            if (!senderPublicKey) throw new Error('Clé publique du distributeur indisponible.');
            groupKey = await decryptGroupKeyPackage(keyPackage.encryptedKey, privateKey, senderPublicKey);
            if (!groupKey) throw new Error('Impossible de déchiffrer la clé du groupe.');
            await storeGroupKey(group._id, currentVersion, groupKey);
          }
          response = await api.get(
            `/api/groups/${encodeURIComponent(group._id)}/messages?limit=1`,
            auth(token)
          );
          const latest = Array.isArray(response.data) ? response.data[0] : null;
          if (!latest) throw new Error('Aucun message dans ce groupe.');
          if (latest.encrypted === false) plaintext = latest.content || '';
          else {
            const messageVersion = latest.keyVersion || currentVersion;
            const messageKey = messageVersion === currentVersion ? groupKey : await getStoredGroupKey(group._id, messageVersion);
            if (!messageKey) throw new Error('Ancienne clé de groupe absente sur cet appareil.');
            plaintext = await decryptMessage(messageKey, latest.content);
          }
        }
        if (plaintext === null) throw new Error('Impossible de déchiffrer ce message avec la clé locale.');
        if (!cancelled) setLocalReadResult({
          name: pendingRead.conversationName,
          label: pendingRead.type === 'private_message' ? (pendingRead.direction === 'sent' ? 'Dernier message envoyé à' : 'Dernier message reçu de') : 'Dernier message du groupe',
          content: plaintext
        });
      } catch (err) {
        if (!cancelled) setLocalReadResult({ name: pendingRead.conversationName, error: err.response?.data?.error || err.message || 'Lecture locale impossible.' });
      } finally {
        if (!cancelled) {
          setReadingLocal(false);
          setPendingRead(null);
        }
      }
    };
    readLatestMessageLocally();
    return () => { cancelled = true; };
  }, [pendingRead, token, user]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add('propard-ai-page');
    body.classList.add('propard-ai-page');
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height || window.innerHeight;
      const offsetTop = viewport?.offsetTop || 0;
      root.style.setProperty('--propard-ai-viewport-height', height + 'px');
      root.style.setProperty('--propard-ai-viewport-offset-top', offsetTop + 'px');
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      root.classList.remove('propard-ai-page');
      body.classList.remove('propard-ai-page');
      root.style.removeProperty('--propard-ai-viewport-height');
      root.style.removeProperty('--propard-ai-viewport-offset-top');
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const createConversation = async () => {
    try {
      setError('');
      const response = await api.post('/api/ai/conversations', {}, auth(token));
      const conversation = response.data;
      setConversations(current => [conversation, ...current]);
      setActiveId(conversation.id);
      updateConversationUrl(conversation.id);
      setMessages([]);
      setDraft('');
      setSidebarOpen(false);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de créer une conversation.');
    }
  };

  const sendMessage = async (event, voiceContent = null) => {
    event?.preventDefault();
    const content = typeof voiceContent === 'string' ? voiceContent.trim() : draft.trim();
    if (!content || sending) return;
    setError('');
    setSending(true);
    setDraft('');
    let conversationId = activeId;
    try {
      if (!conversationId) {
        const created = await api.post('/api/ai/conversations', {}, auth(token));
        conversationId = created.data.id;
        setActiveId(conversationId);
        updateConversationUrl(conversationId);
        setConversations(current => [created.data, ...current]);
      }
      setMessages(current => [...current, { role: 'user', content }]);
      const response = await api.post(
        `/api/ai/conversations/${conversationId}/messages`,
        { content },
        auth(token)
      );
      setMessages(current => [
        ...current.slice(0, -1),
        response.data.userMessage,
        response.data.assistantMessage
      ]);
      setPendingAction(response.data.pendingAction || null);
      setPendingRead(response.data.pendingRead || null);
      setLocalReadResult(null);
      setActionNotice('');
      await loadConversations();
      return response.data.assistantMessage?.content || '';
    } catch (err) {
      setMessages(current => current.slice(0, -1));
      setDraft(content);
      setError(err.response?.data?.error || 'Une erreur est survenue pendant la génération.');
      return null;
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const waitForSocket = async () => {
    if (socket.connected) return;
    socket.auth = { token };
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Connexion sécurisée au serveur indisponible.'));
      }, 10000);
      const onConnect = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Impossible de connecter la messagerie.')); };
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };
      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
      socket.connect();
    });
  };

  const emitMessageWithConfirmation = async (eventName, successEvent, errorEvent, payload) => {
    await waitForSocket();
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Aucune confirmation du serveur après l’envoi.'));
      }, 15000);
      const onSuccess = () => { cleanup(); resolve(); };
      const onError = data => { cleanup(); reject(new Error(data?.message || 'Envoi refusé par le serveur.')); };
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off(successEvent, onSuccess);
        socket.off(errorEvent, onError);
      };
      socket.once(successEvent, onSuccess);
      socket.once(errorEvent, onError);
      socket.emit(eventName, payload);
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || actionLoading) return;
    setActionLoading(true);
    setActionNotice('');
    try {
      const userId = (user?.id || user?._id)?.toString();
      if (!userId) throw new Error('Compte utilisateur introuvable.');
      const privateKey = await getStoredPrivateKeyJwk(userId);
      if (!privateKey) throw new Error('Clé privée E2EE locale introuvable.');

      if (pendingAction.type === 'private_message') {
        const profile = await api.get(
          `/api/auth/user/${encodeURIComponent(pendingAction.recipientId)}`,
          auth(token)
        );
        const publicKeyValue = profile.data?.publicKey;
        const publicKey = typeof publicKeyValue === 'string' ? JSON.parse(publicKeyValue) : publicKeyValue;
        if (!publicKey) throw new Error('Clé publique du destinataire indisponible.');
        const sharedKey = await deriveSharedKey(privateKey, publicKey);
        const encryptedContent = await encryptMessage(sharedKey, pendingAction.content);
        await emitMessageWithConfirmation('sendMessage', 'messageSent', 'messageError', {
          receiverId: pendingAction.recipientId,
          content: encryptedContent
        });
      } else if (pendingAction.type === 'group_message') {
        const groupResponse = await api.get(
          `/api/groups/${encodeURIComponent(pendingAction.groupId)}`,
          auth(token)
        );
        const group = groupResponse.data;
        const keyVersion = group.keyVersion || 1;
        let groupKey = await getStoredGroupKey(group._id, keyVersion);
        if (!groupKey) {
          const keyPackage = group.keyPackage;
          if (!keyPackage?.encryptedKey || !keyPackage?.senderId) throw new Error('Clé du groupe introuvable sur cet appareil.');
          const senderId = keyPackage.senderId.toString();
          const senderPublicKeyValue = keyPackage.senderPublicKey || group.members?.find(member => member._id?.toString() === senderId)?.publicKey;
          const senderPublicKey = typeof senderPublicKeyValue === 'string' ? JSON.parse(senderPublicKeyValue) : senderPublicKeyValue;
          if (!senderPublicKey) throw new Error('Clé publique du distributeur indisponible.');
          groupKey = await decryptGroupKeyPackage(keyPackage.encryptedKey, privateKey, senderPublicKey);
          if (!groupKey) throw new Error('Impossible de déchiffrer la clé du groupe.');
          await storeGroupKey(group._id, keyVersion, groupKey);
        }
        const encryptedContent = await encryptMessage(groupKey, pendingAction.content);
        await emitMessageWithConfirmation('sendGroupMessage', 'groupMessageSent', 'groupMessageError', {
          groupId: group._id,
          content: encryptedContent,
          keyVersion
        });
      } else {
        throw new Error('Action inconnue.');
      }

      setPendingAction(null);
      setActionNotice('Message envoyé.');
    } catch (err) {
      setActionNotice(err.response?.data?.error || err.message || 'Impossible d’envoyer le message.');
    } finally {
      setActionLoading(false);
    }
  };

  const renameConversation = async conversation => {
    const title = window.prompt('Nouveau titre', conversation.title);
    if (!title?.trim()) return;
    try {
      const response = await api.patch(`/api/ai/conversations/${conversation.id}`, { title }, auth(token));
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, title: response.data.title } : item));
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de renommer cette conversation.');
    }
  };

  const deleteConversation = async conversation => {
    if (!window.confirm(`Supprimer « ${conversation.title} » ?`)) return;
    try {
      await api.delete(`/api/ai/conversations/${conversation.id}`, auth(token));
      const remaining = conversations.filter(item => item.id !== conversation.id);
      setConversations(remaining);
      if (activeId === conversation.id) {
        if (remaining.length) await openConversation(remaining[0].id);
        else {
          setActiveId(null);
          updateConversationUrl(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer cette conversation.');
    }
  };

  const styles = {
    shell: { position: 'fixed', top: 'var(--propard-ai-viewport-offset-top, 0px)', left: 0, right: 0, width: '100vw', height: 'var(--propard-ai-viewport-height, 100dvh)', minHeight: 0, display: 'flex', background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden', overscrollBehavior: 'none' },
    sidebar: { width: 280, maxWidth: '85vw', minWidth: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', overflowY: 'auto' },
    sideHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    brand: { fontSize: 17, fontWeight: 800, letterSpacing: '-.4px' },
    newButton: { width: '100%', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', fontWeight: 650 },
    conversation: { display: 'flex', alignItems: 'center', gap: 5, padding: '9px 8px', borderRadius: 8, background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', width: '100%' },
    activeConversation: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
    main: { flex: 1, minWidth: 0, minHeight: 0, width: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    top: { minHeight: 58, flexShrink: 0, padding: 'max(10px, env(safe-area-inset-top)) 18px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' },
    back: { color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' },
    feed: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '28px 18px 18px' },
    content: { width: '100%', maxWidth: 1100, minWidth: 0, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
    welcome: { textAlign: 'center', padding: '10vh 12px 20px' },
    bubble: { maxWidth: '100%', minWidth: 0, padding: '13px 16px', borderRadius: 16, lineHeight: 1.6, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal' },
    userBubble: { alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 5 },
    assistantBubble: { alignSelf: 'stretch', width: '100%', maxWidth: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderBottomLeftRadius: 5 },
    composerWrap: { flexShrink: 0, width: '100%', padding: '12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))', borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' },
    composer: { width: '100%', maxWidth: 1100, minWidth: 0, margin: '0 auto', display: 'flex', gap: 9, alignItems: 'flex-end', padding: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 15 },
    textarea: { flex: 1, minWidth: 0, width: 0, resize: 'none', border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 14, lineHeight: 1.5, padding: '7px 6px', maxHeight: 180 },
    send: { border: 0, borderRadius: 10, background: 'var(--accent)', color: '#fff', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' },
    muted: { color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 },
    error: { color: 'var(--danger)', fontSize: 13, textAlign: 'center', padding: '8px 14px' }
  };

  return (
    <div style={styles.shell}>
      {(sidebarOpen || window.innerWidth >= 700) && <div style={{ ...styles.sidebar, position: window.innerWidth < 700 ? 'fixed' : 'relative', inset: window.innerWidth < 700 ? '0 auto 0 0' : undefined, zIndex: 30, boxShadow: window.innerWidth < 700 ? '0 0 0 100vmax rgba(0,0,0,.5)' : 'none' }}>
        <div style={styles.sideHeader}>
          <span style={styles.brand}>Propard<span style={{ color: 'var(--accent)' }}>.</span> AI</span>
          <button onClick={() => setSidebarOpen(false)} style={{ ...styles.back, display: window.innerWidth < 700 ? 'block' : 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        <a href="/" style={styles.back}>← Retour à Propard</a>
        <button style={styles.newButton} onClick={createConversation}>＋ Nouvelle conversation</button>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 5px 0' }}>Conversations</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {conversations.map(conversation => (
            <div key={conversation.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <button onClick={() => openConversation(conversation.id)} style={{ ...styles.conversation, ...(activeId === conversation.id ? styles.activeConversation : {}), flex: 1, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{conversation.title}</span>
              </button>
              <button title="Renommer" onClick={() => renameConversation(conversation)} style={{ ...styles.back, padding: '5px 7px', cursor: 'pointer' }}>✎</button>
              <button title="Supprimer" onClick={() => deleteConversation(conversation)} style={{ ...styles.back, padding: '5px 7px', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          {!conversations.length && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>Aucune conversation pour le moment.</div>}
        </div>
      </div>}
      <main style={styles.main}>
        <header style={styles.top}>
          <button onClick={() => setSidebarOpen(true)} style={{ ...styles.back, display: window.innerWidth < 700 ? 'block' : 'none', background: 'transparent', cursor: 'pointer' }}>☰</button>
          <strong>Propard AI</strong>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{available === false ? 'IA indisponible' : 'Assistant'}</span>
          <VoiceMode onSend={content => sendMessage(null, content)} sending={sending} />
        </header>
        <section style={styles.feed}>
          <div style={styles.content}>
            {loading && <div style={styles.welcome}>Chargement de tes conversations…</div>}
            {!loading && !messages.length && <div style={styles.welcome}>
              <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 12 }}>Propard<span style={{ color: 'var(--accent)' }}>.</span> AI</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Comment puis-je t’aider aujourd’hui ?</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>Tes conversations sont privées et enregistrées sur ton compte.</div>
            </div>}
            {messages.map((message, index) => <div key={`${message.createdAt || index}-${index}`} style={{ ...styles.bubble, ...(message.role === 'user' ? styles.userBubble : styles.assistantBubble) }}>{message.role === 'assistant' ? <MarkdownRenderer content={message.content} /> : message.content}</div>)}
            {pendingAction && <div style={{ ...styles.bubble, ...styles.assistantBubble, border: '1px solid var(--accent)' }}>
              <strong>Confirmer l’envoi</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Destinataire : {pendingAction.type === 'private_message' ? pendingAction.recipientName : pendingAction.groupName}</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 10 }}>{pendingAction.content}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" disabled={actionLoading} onClick={confirmPendingAction} style={styles.send}>{actionLoading ? 'Envoi…' : 'Confirmer et envoyer'}</button>
                <button type="button" disabled={actionLoading} onClick={() => { setPendingAction(null); setActionNotice('Envoi annulé.'); }} style={{ ...styles.back, cursor: 'pointer', background: 'transparent' }}>Annuler</button>
              </div>
            </div>}
            {actionNotice && <div style={{ ...styles.bubble, ...styles.assistantBubble, fontSize: 13 }}>{actionNotice}</div>}
            {readingLocal && <div style={{ ...styles.bubble, ...styles.assistantBubble, color: 'var(--text-muted)' }}>Déchiffrement du dernier message directement sur cet appareil…</div>}
            {localReadResult && <div style={{ ...styles.bubble, ...styles.assistantBubble, border: '1px solid var(--border)' }}>
              <strong>{localReadResult.label} {localReadResult.name}</strong>
              {localReadResult.error ? <div style={{ color: 'var(--danger)', marginTop: 8 }}>{localReadResult.error}</div> : <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{localReadResult.content}</div>}
              <div style={styles.muted}>Déchiffré localement. Ce contenu n’a pas été envoyé à Groq ni enregistré dans l’historique IA.</div>
              <button type="button" onClick={() => setLocalReadResult(null)} style={{ ...styles.back, marginTop: 8, cursor: 'pointer', background: 'transparent' }}>Fermer</button>
            </div>}
            {sending && <div style={{ ...styles.bubble, ...styles.assistantBubble, color: 'var(--text-muted)' }}>Propard AI réfléchit…</div>}
            <div ref={endRef} />
          </div>
        </section>
        {error && <div style={styles.error}>{error}</div>}
        {available === false && <div style={styles.error}>Les clés Groq ne semblent pas configurées sur le serveur.</div>}
        <div style={styles.composerWrap}>
          <form style={styles.composer} onSubmit={sendMessage}>
            <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Écris un message à Propard AI…" rows={1} maxLength={6000} style={styles.textarea} />
            <VoiceDictationButton value={draft} onChange={setDraft} disabled={sending} />
            <button type="submit" disabled={sending || !draft.trim()} style={{ ...styles.send, opacity: sending || !draft.trim() ? .5 : 1 }}>Envoyer</button>
          </form>
          <div style={styles.muted}>Propard AI peut faire des erreurs. Ne partage pas de secrets ni de clés privées.</div>
        </div>
      </main>
    </div>
  );
}
