import { useEffect, useState } from 'react';
import api from '../utils/api';

export default function ScheduledMessageControl({ token, scope, conversationId, disabled, onSchedule }) {
  const [open, setOpen] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !token || !conversationId) return undefined;
    let cancelled = false;
    api.get('/api/scheduled-messages', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(response => {
      if (cancelled) return;
      const items = (response.data?.messages || []).filter(item =>
        scope === 'private'
          ? item.recipient?.toString() === conversationId.toString()
          : item.group?.toString() === conversationId.toString()
      );
      setMessages(items);
    }).catch(err => {
      if (!cancelled) setError(err.response?.data?.error || 'Impossible de charger les messages programmés.');
    });
    return () => {
      cancelled = true;
    };
  }, [open, token, scope, conversationId]);

  const submit = async () => {
    if (!dueAt) {
      setError('Choisis une date et une heure.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const success = await onSchedule(new Date(dueAt).toISOString());
      if (success) {
        setDueAt('');
        const response = await api.get('/api/scheduled-messages', {
          headers: { Authorization: 'Bearer ' + token }
        });
        setMessages((response.data?.messages || []).filter(item =>
          scope === 'private'
            ? item.recipient?.toString() === conversationId.toString()
            : item.group?.toString() === conversationId.toString()
        ));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de programmer le message.');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async message => {
    setLoading(true);
    setError('');
    try {
      await api.delete('/api/scheduled-messages/' + message._id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      setMessages(current => current.filter(item => item._id !== message._id));
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’annuler ce message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 11, opacity: disabled ? 0.5 : 1 }}
      >
        Programmer
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, right: 0, bottom: 'calc(100% + 8px)', width: 'min(310px, calc(100vw - 32px))', padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)', boxShadow: '0 8px 28px rgba(0,0,0,.22)' }}>
          <strong>Programmer le message</strong>
          <p style={{ margin: '6px 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>Le contenu reste chiffré de bout en bout. Envoi possible dans les 30 prochains jours.</p>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={event => setDueAt(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
          <button type="button" onClick={submit} disabled={loading || disabled} style={{ width: '100%', marginTop: 8, padding: 9, border: 0, borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 700 }} >{loading ? 'Patiente…' : 'Confirmer'}</button>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <strong style={{ fontSize: 12 }}>En attente</strong>
            {messages.filter(item => ['pending', 'processing'].includes(item.status)).length === 0
              ? <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aucun message programmé.</p>
              : messages.filter(item => ['pending', 'processing'].includes(item.status)).map(item => (
                <div key={item._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 12 }}>
                  <span>{new Date(item.dueAt).toLocaleString()}</span>
                  <button type="button" onClick={() => cancel(item)} disabled={loading || item.status !== 'pending'} style={{ border: '1px solid var(--danger)', borderRadius: 6, padding: '4px 7px', color: 'var(--danger)', background: 'transparent' }}>Annuler</button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
