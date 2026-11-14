import React, { useEffect, useRef, useState } from 'react';
import {
  downloadConversationFile,
  getConversationFileCategory
} from '../utils/fileUpload';

export default function FileAttachments({ attachments, token, userId }) {
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const objectUrlsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setFiles({});
    setError('');

    if (!Array.isArray(attachments) || attachments.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const prepare = async () => {
      await Promise.all(attachments.map(async rawId => {
        const fileId = rawId?.toString();
        if (!fileId) return;

        try {
          const category = await getConversationFileCategory(fileId, { token });
          if (cancelled) return;

          setFiles(previous => ({
            ...previous,
            [fileId]: { category, loading: false, url: null }
          }));

          if (category === 'image') {
            await loadPreview(fileId, category, cancelled);
          }
        } catch (err) {
          if (!cancelled) {
            setFiles(previous => ({
              ...previous,
              [fileId]: {
                category: 'document',
                loading: false,
                url: null,
                error: err.response?.data?.error || 'Aperçu indisponible.'
              }
            }));
          }
        }
      }));
    };

    prepare();

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [attachments, token, userId]);

  const loadPreview = async (fileId, category, cancelled = false) => {
    setFiles(previous => ({
      ...previous,
      [fileId]: { ...previous[fileId], category, loading: true, error: '' }
    }));

    try {
      const result = await downloadConversationFile(fileId, { userId, token });
      const expectedType = category === 'image' ? 'image/' : 'video/';

      if (!result.type?.startsWith(expectedType)) {
        throw new Error('Le type réel du fichier ne correspond pas à son aperçu.');
      }

      const url = URL.createObjectURL(result.blob);
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }

      objectUrlsRef.current.push(url);
      setFiles(previous => ({
        ...previous,
        [fileId]: {
          ...previous[fileId],
          category,
          loading: false,
          url,
          name: result.name,
          type: result.type,
          error: ''
        }
      }));
    } catch (err) {
      if (!cancelled) {
        setFiles(previous => ({
          ...previous,
          [fileId]: {
            ...previous[fileId],
            category,
            loading: false,
            error: err.response?.data?.error || err.message || 'Aperçu impossible.'
          }
        }));
      }
    }
  };

  const download = async fileId => {
    setFiles(previous => ({
      ...previous,
      [fileId]: { ...previous[fileId], downloading: true, error: '' }
    }));

    try {
      const result = await downloadConversationFile(fileId, { userId, token });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.name || 'fichier';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setFiles(previous => ({
        ...previous,
        [fileId]: {
          ...previous[fileId],
          downloading: false,
          error: err.response?.data?.error || err.message || 'Téléchargement impossible.'
        }
      }));
      return;
    }

    setFiles(previous => ({
      ...previous,
      [fileId]: { ...previous[fileId], downloading: false }
    }));
  };

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      {attachments.map(rawId => {
        const fileId = rawId?.toString();
        const file = files[fileId] || {};
        const isImage = file.category === 'image';
        const isVideo = file.category === 'video';

        return (
          <div key={fileId} style={styles.item}>
            {isImage && file.url ? (
              <a href={file.url} target="_blank" rel="noopener noreferrer" style={styles.previewLink}>
                <img src={file.url} alt={file.name || 'Image jointe'} style={styles.image} />
              </a>
            ) : null}

            {isVideo && file.url ? (
              <video
                src={file.url}
                controls
                playsInline
                preload="metadata"
                style={styles.video}
              />
            ) : null}

            {(!isImage || !file.url) && (!isVideo || !file.url) && (
              <div style={styles.fileRow}>
                <span style={styles.icon}>{isImage ? '🖼️' : isVideo ? '🎬' : '📎'}</span>
                <span style={styles.label}>
                  {isImage ? 'Image jointe' : isVideo ? 'Vidéo jointe' : 'Fichier joint'}
                </span>
                {isImage && file.loading ? (
                  <span style={styles.status}>Chargement de l’image...</span>
                ) : null}
                {isVideo && !file.url && !file.loading ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => loadPreview(fileId, 'video')}
                  >
                    Lire
                  </button>
                ) : null}
                {file.loading ? <span style={styles.status}>Chargement...</span> : null}
                {!isImage && !isVideo ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => download(fileId)}
                    disabled={Boolean(file.downloading)}
                  >
                    {file.downloading ? 'Téléchargement...' : 'Télécharger'}
                  </button>
                ) : null}
                {(isImage || isVideo) && !file.url ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => download(fileId)}
                    disabled={Boolean(file.downloading)}
                  >
                    {file.downloading ? 'Téléchargement...' : 'Télécharger'}
                  </button>
                ) : null}
              </div>
            )}

            {(isImage || isVideo) && file.url ? (
              <div style={styles.mediaActions}>
                <span style={styles.label}>{file.name || (isImage ? 'Image' : 'Vidéo')}</span>
                <button
                  type="button"
                  style={styles.button}
                  onClick={() => download(fileId)}
                  disabled={Boolean(file.downloading)}
                >
                  {file.downloading ? 'Téléchargement...' : 'Télécharger'}
                </button>
              </div>
            ) : null}

            {file.error ? <p style={styles.error}>{file.error}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
    minWidth: 0,
    maxWidth: '100%'
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    padding: 8,
    borderRadius: 10,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    minWidth: 0,
    maxWidth: '100%'
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0
  },
  icon: {
    flexShrink: 0
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: 'var(--text-primary)',
    overflowWrap: 'anywhere'
  },
  status: {
    fontSize: 11,
    color: 'var(--text-secondary)'
  },
  previewLink: {
    display: 'block',
    maxWidth: '100%'
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: 320,
    objectFit: 'contain',
    borderRadius: 7
  },
  video: {
    display: 'block',
    width: '100%',
    maxWidth: 520,
    maxHeight: 360,
    background: '#000',
    borderRadius: 7
  },
  mediaActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0
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
