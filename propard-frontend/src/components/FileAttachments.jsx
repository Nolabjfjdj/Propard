import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadConversationFile,
  getConversationFileInfo
} from '../utils/fileUpload';

const MAX_INLINE_VIDEO_SIZE = 100 * 1024 * 1024;

function getAttachmentId(value) {
  const id = value?._id || value?.fileId || value?.id || value;
  return typeof id === 'string' ? id : id?.toString?.() || '';
}

export default function FileAttachments({ attachments, token, userId }) {
  const [files, setFiles] = useState({});
  const objectUrlsRef = useRef([]);

  const loadPreview = useCallback(async (fileId, category, cancelled = false) => {
    setFiles(previous => ({
      ...previous,
      [fileId]: { ...previous[fileId], category, loading: true, error: '' }
    }));

    try {
      const result = await downloadConversationFile(fileId, { userId, token });
      const expectedType = category === 'image' ? 'image/' : 'video/';
      const filename = String(result.name || '').toLowerCase();
      const extensionMatches = category === 'image'
        ? /\.(jpg|jpeg|jpe|png|gif|webp|avif|bmp|svg)$/.test(filename)
        : /\.(mp4|m4v|webm|mov|ogv)$/.test(filename);

      if (!result.type?.startsWith(expectedType) && !extensionMatches) {
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
  }, [userId, token]);

  useEffect(() => {
    let cancelled = false;
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setFiles({});

    if (!Array.isArray(attachments) || attachments.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const prepare = async () => {
      await Promise.all(attachments.map(async rawId => {
        const fileId = getAttachmentId(rawId);
        if (!fileId) return;

        try {
          const info = await getConversationFileInfo(fileId, { token });
          if (cancelled) return;

          setFiles(previous => ({
            ...previous,
            [fileId]: {
              category: info.category,
              size: info.size,
              loading: false,
              url: null
            }
          }));

          if (info.category === 'image') {
            await loadPreview(fileId, 'image', cancelled);
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
  }, [attachments, token, loadPreview]);

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
        const videoTooLarge = isVideo && file.size > MAX_INLINE_VIDEO_SIZE;

        return (
          <div key={fileId} style={styles.item}>
            {isImage && file.url ? (
              <a href={file.url} target="_blank" rel="noopener noreferrer" style={styles.previewLink}>
                <img
                  src={file.url}
                  alt={file.name || 'Image jointe'}
                  style={styles.image}
                  onLoad={() => setFiles(previous => ({
                    ...previous,
                    [fileId]: { ...previous[fileId], imageLoaded: true }
                  }))}
                  onError={() => setFiles(previous => ({
                    ...previous,
                    [fileId]: {
                      ...previous[fileId],
                      imageLoaded: false,
                      error: 'Impossible d’afficher cette image dans le navigateur.'
                    }
                  }))}
                />
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
                {file.loading ? (
                  <span style={styles.status}>Chargement...</span>
                ) : null}
                {isImage && !file.loading && !file.error ? (
                  <span style={styles.status}>Préparation de l’aperçu</span>
                ) : null}
                {isVideo && !file.url && !file.loading && !videoTooLarge ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => loadPreview(fileId, 'video')}
                  >
                    Lire
                  </button>
                ) : null}
                {videoTooLarge ? (
                  <span style={styles.status}>Vidéo trop volumineuse pour la lecture intégrée</span>
                ) : null}
                <button
                  type="button"
                  style={styles.button}
                  onClick={() => download(fileId)}
                  disabled={Boolean(file.downloading)}
                >
                  {file.downloading ? 'Téléchargement...' : 'Télécharger'}
                </button>
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
    minWidth: 0,
    flexWrap: 'wrap'
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
    width: 'fit-content',
    maxWidth: '100%',
    textDecoration: 'none',
    lineHeight: 0
  },
  image: {
    display: 'block',
    width: 'auto',
    height: 'auto',
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
