import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

const panel = {
  width: '100%',
  maxWidth: 760,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-secondary)',
  overflow: 'hidden',
  color: 'var(--text-primary)'
};

export default function SupportConversationPage({ reference }) {
  const [accessToken, setAccessToken] = useState('');
  const [ticket, setTicket] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    setAccessToken(token);
  }, []);

  const refresh = useCallback(async () => {
    if (!accessToken || !reference) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.post('/api/auth/account-help/status', {
        reference,
        accessToken
      });
      setTicket(response.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger cette conversation.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, reference]);

  useEffect(() => {
    if (!accessToken) return;
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [accessToken, refresh]);

  const send = async event => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post('/api/auth/account-help/message', {
        reference,
        accessToken,
        message: text
      });
      setMessage('');
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’envoyer le message.');
    } finally {
      setSending(false);
    }
  };

  const statusLabel = ticket?.status === 'new' ? 'Nouvelle demande' :
    ticket?.status === 'in_progress' ? 'En cours' : 'Résolue';

  return (
    <main style={{ minHeight: '100vh', padding: 'clamp(14px, 4vw, 28px)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', color: 'var(--text-primary)' }}>
      <section style={panel}>
        <header style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <a href="/help" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}>← Centre d’aide</a>
            <h1 style={{ margin: '10px 0 4px', fontSize: 22 }}>{ticket?.kind === 'password_reset' ? 'Récupération de compte' : 'Support Propard'}</h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Demande de @{ticket?.username || '…'} · Réf. {reference}</div>
          </div>
          {ticket && <span style={{ border: '1px solid var(--border)', borderRadius: 20, padding: '6px 10px', fontSize: 12 }}>{statusLabel}</span>}
        </header>

        {loading && <p style={{ padding: 20 }}>Chargement de la conversation…</p>}
        {!loading && !accessToken && <p style={{ padding: 20 }}>Le lien de conversation est incomplet. Rouvre le lien complet qui t’a été donné après l’envoi de la demande.</p>}
        {error && <p role="alert" style={{ margin: 16, color: 'var(--danger, #f66)' }}>{error}</p>}

        {ticket && (
          <>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 260, maxHeight: '55vh', overflowY: 'auto' }}>
              {(ticket.messages || []).map((item, index) => {
                const staff = item.senderType === 'staff';
                return (
                  <div key={item._id || index} style={{ alignSelf: staff ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '11px 14px', borderRadius: staff ? '14px 14px 14px 4px' : '14px 14px 4px 14px', background: staff ? 'var(--bg-tertiary)' : 'var(--accent)', color: staff ? 'var(--text-primary)' : '#fff', overflowWrap: 'anywhere' }}>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 5 }}>{staff ? 'Personnel Propard' : 'Toi'} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>
                  </div>
                );
              })}
              {ticket.recoveryCode && (
                <div style={{ padding: 14, border: '1px solid var(--accent)', borderRadius: 10 }}>
                  <strong>Code de récupération temporaire</strong>
                  <p style={{ margin: '8px 0' }}>Expire le {new Date(ticket.recoveryCodeExpiresAt).toLocaleString()}.</p>
                  <code style={{ display: 'block', userSelect: 'all', overflowWrap: 'anywhere' }}>{ticket.recoveryCode}</code>
                  <p style={{ marginBottom: 0 }}>Utilise ce code sur <a href="/password-reset" style={{ color: 'var(--accent)' }}>/password-reset</a>. Ne le partage avec personne.</p>
                </div>
              )}
            </div>
            <form onSubmit={send} style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'grid', gap: 10 }}>
              {ticket.status === 'resolved' ? (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Cette demande est résolue et la conversation est fermée.</p>
              ) : (
                <>
                  <textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1500} rows={3} placeholder="Écris un message au support…" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 12, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', font: 'inherit' }} />
                  <button type="submit" disabled={sending || !message.trim()} style={{ justifySelf: 'end', padding: '11px 18px', border: 0, borderRadius: 9, background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{sending ? 'Envoi…' : 'Envoyer le message'}</button>
                </>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  );
}
