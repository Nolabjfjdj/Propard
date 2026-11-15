import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useAuth } from '../context/AuthContext';

const auth = token => ({ headers: { Authorization: `Bearer ${token}` } });

export default function PropardAIPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(null);
  const [keyCount, setKeyCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const response = await api.get('/api/ai/conversations', auth(token));
    setConversations(response.data || []);
    return response.data || [];
  }, [token]);

  const openConversation = useCallback(async id => {
    setError('');
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const response = await api.get(`/api/ai/conversations/${id}`, auth(token));
      setMessages(response.data.messages || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger cette conversation.');
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.get('/api/ai/status', auth(token)),
      api.get('/api/ai/conversations', auth(token))
    ]).then(([status, list]) => {
      if (!mounted) return;
      setAvailable(status.data.available);
      setKeyCount(status.data.keyCount || 0);
      setConversations(list.data || []);
      if (list.data?.length) {
        const first = list.data[0];
        setActiveId(first.id);
        return api.get(`/api/ai/conversations/${first.id}`, auth(token)).then(result => {
          if (mounted) setMessages(result.data.messages || []);
        });
      }
    }).catch(err => {
      if (mounted) setError(err.response?.data?.error || 'Impossible de contacter Propard AI.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [token]);

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
      setMessages([]);
      setDraft('');
      setSidebarOpen(false);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de créer une conversation.');
    }
  };

  const sendMessage = async event => {
    event?.preventDefault();
    const content = draft.trim();
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
      await loadConversations();
    } catch (err) {
      setMessages(current => current.slice(0, -1));
      setDraft(content);
      setError(err.response?.data?.error || 'Une erreur est survenue pendant la génération.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
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
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer cette conversation.');
    }
  };

  const styles = {
    shell: { height: '100dvh', minHeight: '100vh', display: 'flex', background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden' },
    sidebar: { width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', overflowY: 'auto' },
    sideHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    brand: { fontSize: 17, fontWeight: 800, letterSpacing: '-.4px' },
    newButton: { width: '100%', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', fontWeight: 650 },
    conversation: { display: 'flex', alignItems: 'center', gap: 5, padding: '9px 8px', borderRadius: 8, background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', width: '100%' },
    activeConversation: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
    main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
    top: { minHeight: 58, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' },
    back: { color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' },
    feed: { flex: 1, overflowY: 'auto', padding: '28px 18px 18px' },
    content: { width: '100%', maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
    welcome: { textAlign: 'center', padding: '10vh 12px 20px' },
    bubble: { maxWidth: '85%', padding: '13px 16px', borderRadius: 16, lineHeight: 1.6, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    userBubble: { alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 5 },
    assistantBubble: { alignSelf: 'flex-start', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderBottomLeftRadius: 5 },
    composerWrap: { padding: '12px 18px max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' },
    composer: { maxWidth: 820, margin: '0 auto', display: 'flex', gap: 9, alignItems: 'flex-end', padding: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 15 },
    textarea: { flex: 1, minWidth: 0, resize: 'none', border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 14, lineHeight: 1.5, padding: '7px 6px', maxHeight: 180 },
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
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{available === false ? 'IA indisponible' : available ? `${keyCount} clé${keyCount > 1 ? 's' : ''} Groq` : 'Assistant'}</span>
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
            {sending && <div style={{ ...styles.bubble, ...styles.assistantBubble, color: 'var(--text-muted)' }}>Propard AI réfléchit…</div>}
            <div ref={endRef} />
          </div>
        </section>
        {error && <div style={styles.error}>{error}</div>}
        {available === false && <div style={styles.error}>Les clés Groq ne semblent pas configurées sur le serveur.</div>}
        <div style={styles.composerWrap}>
          <form style={styles.composer} onSubmit={sendMessage}>
            <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Écris un message à Propard AI…" rows={1} maxLength={6000} style={styles.textarea} />
            <button type="submit" disabled={sending || !draft.trim()} style={{ ...styles.send, opacity: sending || !draft.trim() ? .5 : 1 }}>Envoyer</button>
          </form>
          <div style={styles.muted}>Propard AI peut faire des erreurs. Ne partage pas de secrets ni de clés privées.</div>
        </div>
      </main>
    </div>
  );
}
