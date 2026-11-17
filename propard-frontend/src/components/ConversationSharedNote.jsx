import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import socket from '../socket';
import { decryptMessage, encryptMessage } from '../utils/crypto';
import { getStoredGroupKey } from '../utils/groupCrypto';

export default function ConversationSharedNote({ scope, conversationId, userId, token, encryptionKey, keyVersion = 1 }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const headers = { Authorization: 'Bearer ' + token };
  const endpoint = scope === 'private'
    ? '/api/notes/private/' + conversationId
    : '/api/notes/group/' + conversationId;

  const conversationKey = scope === 'private'
    ? [String(userId), String(conversationId)].sort().join(':')
    : String(conversationId);

  const loadNote = async () => {
    if (!encryptionKey || !conversationId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(endpoint, { headers });
      if (response.data?.encryptedContent) {
        let plaintext;
        if (scope === 'group' && Number(response.data.keyVersion || 1) !== Number(keyVersion || 1)) {
          const oldKey = await getStoredGroupKey(conversationId, Number(response.data.keyVersion || 1));
          if (!oldKey) {
            throw new Error('Cette note utilise une ancienne clé de groupe qui n’est plus disponible sur cet appareil. Un membre disposant encore de cette clé doit ouvrir la note pour la migrer.');
          }
          plaintext = await decryptMessage(oldKey, response.data.encryptedContent);
          const migratedContent = await encryptMessage(encryptionKey, plaintext);
          const migrated = await api.put(endpoint, {
            encryptedContent: migratedContent,
            keyVersion: Number(keyVersion || 1)
          }, { headers });
          setUpdatedAt(migrated.data?.updatedAt || response.data.updatedAt || null);
        } else {
          plaintext = await decryptMessage(encryptionKey, response.data.encryptedContent);
          setUpdatedAt(response.data.updatedAt || null);
        }
        setContent(typeof plaintext === 'string' ? plaintext : '');
      } else {
        setContent('');
        setUpdatedAt(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Impossible de charger la note.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    loadNote();
    const handleUpdate = event => {
      if (
        event?.scope === scope &&
        event?.conversationKey === conversationKey &&
        event?.updatedBy !== String(userId)
      ) {
        loadNote();
      }
    };
    socket.on('conversationNoteUpdated', handleUpdate);
    return () => socket.off('conversationNoteUpdated', handleUpdate);
  }, [open, scope, conversationKey, encryptionKey, token]);

  const saveNote = async () => {
    if (!encryptionKey || !conversationId || saving) return;
    setSaving(true);
    setError('');
    try {
      const encryptedContent = await encryptMessage(encryptionKey, content);
      const payload = scope === 'group' ? { encryptedContent, keyVersion: Number(keyVersion || 1) } : { encryptedContent };
      const response = await api.put(endpoint, payload, { headers });
      setUpdatedAt(response.data?.updatedAt || new Date().toISOString());
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Impossible d’enregistrer la note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!encryptionKey}
        title="Ouvrir la note partagée chiffrée"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 10px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 12,
          cursor: encryptionKey ? 'pointer' : 'not-allowed',
          opacity: encryptionKey ? 1 : 0.55,
          whiteSpace: 'nowrap'
        }}
      >
        Note partagée
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Note partagée"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
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
              width: 'min(620px, 100%)',
              padding: 20,
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Note partagée</h2>
                <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
                  Chiffrée sur ton appareil avant son enregistrement
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Fermer
              </button>
            </div>
            {loading ? <p style={{ color: 'var(--text-secondary)' }}>Chargement…</p> : (
              <textarea
                value={content}
                onChange={event => setContent(event.target.value.slice(0, 12000))}
                maxLength={12000}
                rows={12}
                placeholder="Écris ici les informations à partager avec cette conversation..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 16,
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  resize: 'vertical',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  font: 'inherit'
                }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <small style={{ color: 'var(--text-secondary)' }}>
                {updatedAt ? 'Modifiée le ' + new Date(updatedAt).toLocaleString('fr-FR') : 'Pas encore enregistrée'}
              </small>
              <button type="button" onClick={saveNote} disabled={loading || saving || !encryptionKey} style={{ border: 0, borderRadius: 8, padding: '9px 14px', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          </section>
        </div>
      )}
    </>
  );
}
