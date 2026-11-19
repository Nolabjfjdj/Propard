import { useEffect, useRef, useState } from 'react';

export default function VoiceMessageRecorder({ disabled, onRecorded }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const cancelledRef = useRef(false);

  const releaseStream = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
    recorderRef.current = null;
  };

  const startRecording = async () => {
    if (disabled || recording || busy) return;
    setError('');
    cancelledRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('L’enregistrement vocal n’est pas pris en charge par ce navigateur.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const supportedTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cancelledRef.current = true;
        setError('Une erreur est survenue pendant l’enregistrement.');
        releaseStream();
        setRecording(false);
      };
      recorder.onstop = async () => {
        const actualType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        releaseStream();
        setRecording(false);
        if (cancelledRef.current) return;
        if (!blob.size) {
          setError('Aucun son n’a été enregistré.');
          return;
        }
        if (blob.size > 25 * 1024 * 1024) {
          setError('Enregistrement trop volumineux. La limite est de 25 Mo.');
          return;
        }
        const extension = actualType.includes('mp4') ? 'm4a' : actualType.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], 'message-vocal-' + Date.now() + '.' + extension, { type: actualType });
        setBusy(true);
        try {
          await onRecorded([file]);
        } catch (err) {
          setError(err.message || 'Impossible d’envoyer le message vocal.');
        } finally {
          setBusy(false);
        }
      };
      recorder.start(250);
      setRecording(true);
      timeoutRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }, 120000);
    } catch (err) {
      releaseStream();
      if (!cancelledRef.current) {
        setRecording(false);
        setError(err.message || 'Impossible d’accéder au microphone.');
      }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else {
      releaseStream();
      setRecording(false);
    }
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseStream();
  }, []);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {!recording ? (
        <button type="button" onClick={startRecording} disabled={disabled || busy} title="Enregistrer un message vocal" aria-label="Enregistrer un message vocal" style={styles.button}>
          {busy ? 'Envoi…' : 'Vocal'}
        </button>
      ) : (
        <>
          <span style={{ color: 'var(--danger)', fontSize: 11, whiteSpace: 'nowrap' }}>● Enregistrement</span>
          <button type="button" onClick={stopRecording} style={styles.button}>Envoyer</button>
          <button type="button" onClick={cancelRecording} style={styles.cancel}>Annuler</button>
        </>
      )}
      {error && <span role="alert" title={error} style={{ color: 'var(--danger)', fontSize: 11, maxWidth: 140 }}>{error}</span>}
    </div>
  );
}

const styles = {
  button: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '7px 9px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: 11,
    cursor: 'pointer'
  },
  cancel: {
    border: '1px solid var(--danger)',
    borderRadius: 8,
    padding: '7px 9px',
    background: 'transparent',
    color: 'var(--danger)',
    fontSize: 11
  }
};
