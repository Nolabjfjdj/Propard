import React, { useMemo, useState } from 'react';
import FileAttachments from './FileAttachments';

export default function ConversationGallery({ messages, token, userId }) {
  const [open, setOpen] = useState(false);
  const attachments = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const message of messages || []) {
      if (message?.deleted) continue;
      for (const item of message?.attachments || []) {
        const id = item?._id || item?.fileId || item?.id || item;
        const key = id?.toString?.() || '';
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(id);
      }
    }
    return result;
  }, [messages]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!attachments.length}
        title="Afficher les médias et fichiers partagés"
        aria-label={`Médias et fichiers partagés : ${attachments.length}`}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 10px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 12,
          cursor: attachments.length ? 'pointer' : 'not-allowed',
          opacity: attachments.length ? 1 : 0.55,
          whiteSpace: 'nowrap'
        }}
      >
        Médias et fichiers ({attachments.length})
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
                  {attachments.length} fichier(s) partagé(s) dans cette conversation
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer la galerie" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Fermer
              </button>
            </div>
            {attachments.length ? (
              <FileAttachments attachments={attachments} token={token} userId={userId} />
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>Aucun fichier partagé pour le moment.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
