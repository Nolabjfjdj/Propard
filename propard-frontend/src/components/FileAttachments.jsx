import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadConversationFile,
  getConversationFileInfo
} from '../utils/fileUpload';

const MAX_AUTO_PREVIEW = 10 * 1024 * 1024;

function getAttachmentId(value) {
  const id = value?._id || value?.fileId || value?.id || value;
  return typeof id === 'string' ? id : id?.toString?.() || '';
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = value => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div style={styles.audioPlayer}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" style={styles.audioPlayButton} onClick={togglePlayback} aria-label={playing ? 'Mettre en pause' : 'Lire le fichier audio'}>
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <div style={styles.audioTimeline}>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onChange={event => seek(event.target.value)}
          disabled={!duration}
          aria-label="Position dans le fichier audio"
          style={styles.audioProgress}
        />
        <div style={styles.audioTimes}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export default function FileAttachments({ attachments, token, userId }) {
  const [files, setFiles] = useState({});
  const objectUrlsRef = useRef([]);
  const previewGenerationRef = useRef(0);

  const loadPreview = useCallback(async (fileId, category, generation = previewGenerationRef.current) => {
    const isCancelled = () => generation !== previewGenerationRef.current;
    setFiles(previous => ({
      ...previous,
      [fileId]: { ...previous[fileId], category, loading: true, error: '' }
    }));

    try {
      const result = await downloadConversationFile(fileId, { userId, token });
      const filename = String(result.name || '').toLowerCase();
      const mimeType = String(result.type || '').toLowerCase();
      const isSvg = filename.endsWith('.svg') || mimeType === 'image/svg+xml';
      const extensionMatches = category === 'image'
        ? /\.(jpg|jpeg|jpe|png|gif|webp|avif|bmp)$/.test(filename)
        : category === 'video'
          ? /\.(mp4|m4v|webm|mov|ogv)$/.test(filename)
          : /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/.test(filename);
      const expectedType = category === 'image' ? 'image/' : category === 'video' ? 'video/' : 'audio/';

      if (isSvg || (!mimeType.startsWith(expectedType) && !extensionMatches)) {
        throw new Error('Le type réel du fichier ne correspond pas à son aperçu.');
      }

      const url = URL.createObjectURL(result.blob);
      if (isCancelled()) {
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
      if (!isCancelled()) {
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
    const generation = ++previewGenerationRef.current;
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setFiles({});

    if (!Array.isArray(attachments) || attachments.length === 0) {
      return () => {
        if (previewGenerationRef.current === generation) previewGenerationRef.current += 1;
      };
    }

    const prepare = async () => {
      await Promise.all(attachments.map(async rawId => {
        const fileId = getAttachmentId(rawId);
        if (!fileId) return;

        try {
          const info = await getConversationFileInfo(fileId, { token, userId });
          if (generation !== previewGenerationRef.current) return;

          setFiles(previous => ({
            ...previous,
            [fileId]: {
              category: info.category,
              size: info.size,
              name: info.name,
              loading: false,
              url: null
            }
          }));

          if (['image', 'video', 'audio'].includes(info.category) && info.size <= MAX_AUTO_PREVIEW) {
            await loadPreview(fileId, info.category, generation);
          }
        } catch (err) {
          if (generation === previewGenerationRef.current) {
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
      if (previewGenerationRef.current === generation) previewGenerationRef.current += 1;
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
        const fileId = getAttachmentId(rawId);
        const file = files[fileId] || {};
        const isImage = file.category === 'image';
        const isVideo = file.category === 'video';
        const isAudio = file.category === 'audio';
        const previewTooLarge = (isImage || isVideo || isAudio) && file.size > MAX_AUTO_PREVIEW;

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
                autoPlay
                muted
                playsInline
                preload="auto"
                style={styles.video}
              />
            ) : null}

            {isAudio && file.url ? <AudioPlayer src={file.url} /> : null}

            {!isAudio ? (
              <div style={styles.fileRow}>
                <span style={styles.label}>{file.name || 'Nom du fichier indisponible'}</span>
              </div>
            ) : null}

            {(!isImage || !file.url) && (!isVideo || !file.url) && (!isAudio || !file.url) && (
              <div style={styles.fileRow}>
                {file.loading ? (
                  <span style={styles.status}>Chargement...</span>
                ) : null}
                {(isImage || isVideo || isAudio) && !file.url && !file.loading && !file.error && !previewTooLarge ? (
                  <span style={styles.status}>Préparation de l’aperçu</span>
                ) : null}
                {(isImage || isVideo || isAudio) && !file.url && !file.loading ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => loadPreview(fileId, file.category)}
                  >
                    Afficher
                  </button>
                ) : null}
                {previewTooLarge ? (
                  <span style={styles.status}>Aperçu manuel pour éviter un téléchargement automatique volumineux</span>
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

            {(isImage || isVideo || isAudio) && file.url ? (
              <div style={styles.mediaActions}>
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
    padding: 0,
    borderRadius: 0,
    background: 'transparent',
    border: 'none',
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
  audioPlayer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 360,
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--bg-secondary)'
  },
  audioPlayButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    flexShrink: 0,
    border: 'none',
    borderRadius: '50%',
    background: '#2583ed',
    color: '#fff',
    fontSize: 15,
    cursor: 'pointer'
  },
  audioTimeline: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  audioProgress: {
    display: 'block',
    width: '100%',
    height: 5,
    margin: '7px 0',
    accentColor: '#2583ed',
    cursor: 'pointer'
  },
  audioTimes: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums'
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
