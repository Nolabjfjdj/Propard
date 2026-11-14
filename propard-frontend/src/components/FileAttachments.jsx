import React, { useState } from 'react';
import { downloadConversationFile } from '../utils/fileUpload';

export default function FileAttachments({ attachments, token, userId }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  const download = async fileId => {
    if (downloadingId) return;

    setDownloadingId(fileId);
    setError('');

    try {
      const result = await downloadConversationFile(fileId, {
        userId,
        token
      });

      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Erreur téléchargement pièce jointe:', err);
      setError(err.response?.data?.error || err.message || 'Téléchargement impossible.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div style={styles.container}>
      {attachments.map(fileId => (
        <div key={fileId} style={styles.item}>
          <span style={styles.icon}>📎</span>
          <span style={styles.label}>Fichier joint</span>
          <button
            type="button"
            style={styles.button}
            onClick={() => download(fileId)}
            disabled={Boolean(downloadingId)}
          >
            {downloadingId === fileId ? 'Téléchargement...' : 'Télécharger'}
          </button>
        </div>
      ))}
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 8,
    minWidth: 0
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    minWidth: 0
  },
  icon: {
    flexShrink: 0
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: 'var(--text-primary)'
  },
  button: {
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '5px 8px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 11,
    cursor: 'pointer',
    flexShrink: 0
  },
  error: {
    margin: 0,
    fontSize: 11,
    color: 'var(--danger)'
  }
};
