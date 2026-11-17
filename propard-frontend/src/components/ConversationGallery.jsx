import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import FileAttachments from './FileAttachments';

export default function ConversationGallery({ messages, token, userId, scope, conversationId }) {
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fallbackAttachments = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const message of messages || []) {
      if (message?.deleted) continue;
      for (const item of message?.attachments || []) {
        const id = item?._id || item?.fileId || item?.id || item;
        const key = id?.toString?.() || '';
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(key);
      }
    }
    return result;
  }, [messages]);

  useEffect(() => {
    if (!open || !conversationId) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const endpoint = scope === 'private'
          ? '/api/friends/messages/' + conversationId + '/attachments'
          : '/api/groups/' + conversationId + '/attachments';
        const response = await api.get(endpoint, {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!cancelled) {
          const unique = [...new Set((response.data?.attachments || []).map(id => id.toString()))];
          setAttachments(unique);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Impossible de charger tous les fichiers. Affichage des fichiers déjà chargés.');
          setAttachments(fallbackAttachments);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, scope, conversationId, token, fallbackAttachments]);

  const count = attachments.length || fallbackAttachments.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!conversationId}
        title="Afficher tous les médias et fichiers partagés"
        aria-label={`Médias et fichiers partagés : ${count}`}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 10px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 12,
          cursor: conversationId ? 'pointer' : 'not-allowed',
          opacity: conversationId ? 1 : 0.55,
          whiteSpace: 'nowrap'
        }}
      >
        Médias et fichiers ({count})
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Médias et fichiers partagés"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.72)'
          }}
        >
          <section
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 20,
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Médias et fichiers</h2>
                <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
                  {count} fichier(s) partagé(s) dans cette conversation
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer la galerie" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Fermer
              </button>
            </div>
            {loading && <p style={{ color: 'var(--text-secondary)' }}>Chargement de tous les fichiers…</p>}
            {error && <p role="alert" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{error}</p>}
            {!loading && attachments.length ? (
              <FileAttachments attachments={attachments} token={token} userId={userId} />
            ) : !loading && !attachments.length ? (
              <p style={{ color: 'var(--text-secondary)' }}>Aucun fichier partagé pour le moment.</p>
            ) : null}
          </section>
        </div>
      )}
    </>
  );
}
