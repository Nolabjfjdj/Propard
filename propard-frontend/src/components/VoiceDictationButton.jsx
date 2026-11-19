import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupportedRecordingMimeType, transcribeAudio } from '../utils/audioTranscription';

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const normalizeTranscript = text => String(text || '')
  .replace(/\bprodromes\s+ai\b/gi, 'Propard AI')
  .replace(/\bpro\s*pard\s+ai\b/gi, 'Propard AI')
  .replace(/\bpropard\s+a[iï]\b/gi, 'Propard AI')
  .replace(/\bpropard\b/gi, 'Propard');

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="9" y="2.5" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function VoiceDictationButton({ value, onChange, disabled = false }) {
  const { token } = useAuth();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const [useServerFallback, setUseServerFallback] = useState(false);
  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const cancelledRef = useRef(false);
  const timerRef = useRef(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    window.clearTimeout(timerRef.current);
    recognitionRef.current?.abort?.();
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    stopTracks();
  }, []);

  const startFallback = async () => {
    if (disabled || transcribing || recording) return;
    setError('');
    setUseServerFallback(true);
    cancelledRef.current = false;
    baseTextRef.current = value || '';
    chunksRef.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Cet appareil ne permet pas l’enregistrement audio dans ce navigateur.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('Une erreur est survenue pendant l’enregistrement audio.');
        setRecording(false);
        stopTracks();
      };
      recorder.onstop = async () => {
        stopTracks();
        setRecording(false);
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setTranscribing(true);
        setError('Transcription en cours…');
        try {
          const transcript = normalizeTranscript(await transcribeAudio(blob, token));
          if (!cancelledRef.current) {
            const base = baseTextRef.current.trim();
            onChange([base, transcript].filter(Boolean).join(base ? ' ' : ''));
            setError('');
          }
        } catch (transcriptionError) {
          if (!cancelledRef.current) setError(transcriptionError.response?.data?.error || transcriptionError.message || 'La transcription audio a échoué.');
        } finally {
          setTranscribing(false);
          recorderRef.current = null;
        }
      };
      recorder.start(250);
      setRecording(true);
      timerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 90000);
    } catch (startError) {
      stopTracks();
      setRecording(false);
      setError(startError.message || 'Impossible d’accéder au microphone.');
    }
  };

  const start = () => {
    if (disabled || recording || transcribing) return;
    const Recognition = getRecognition();
    setError('');
    baseTextRef.current = value || '';
    finalTextRef.current = '';
    cancelledRef.current = false;

    if (!Recognition) {
      void startFallback();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;

    if (typeof window.SpeechRecognitionPhrase === 'function') {
      try {
        recognition.phrases = [
          new window.SpeechRecognitionPhrase('Propard AI', 8),
          new window.SpeechRecognitionPhrase('Propard', 6)
        ];
      } catch {
        recognition.phrases = [];
      }
    }

    recognition.onstart = () => {
      setUseServerFallback(false);
      setRecording(true);
    };
    recognition.onresult = event => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalTextRef.current += transcript;
        else interim += transcript;
      }
      const spoken = normalizeTranscript(finalTextRef.current + interim).trim();
      const base = baseTextRef.current.trim();
      onChange([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
    };
    recognition.onerror = event => {
      if (event.error !== 'aborted') {
        setError(event.error === 'not-allowed'
          ? 'Accès au micro refusé. Vérifie les autorisations du navigateur.'
          : event.error === 'no-speech'
            ? 'Aucune voix détectée. Tu peux réessayer avec l’enregistrement de secours.'
            : 'La reconnaissance du navigateur a échoué. Tu peux utiliser l’enregistrement de secours.');
        setUseServerFallback(true);
      }
      setRecording(false);
    };
    recognition.onend = () => {
      setRecording(false);
      if (cancelledRef.current) {
        onChange(baseTextRef.current);
        return;
      }
      const spoken = normalizeTranscript(finalTextRef.current).trim();
      const base = baseTextRef.current.trim();
      onChange([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setUseServerFallback(true);
      setError('La reconnaissance du navigateur ne démarre pas. Essaie l’enregistrement de secours.');
    }
  };

  const stop = () => {
    window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop?.();
  };

  const cancel = () => {
    cancelledRef.current = true;
    window.clearTimeout(timerRef.current);
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    stopTracks();
    setRecording(false);
    setTranscribing(false);
    onChange(baseTextRef.current);
  };

  const buttonStyle = {
    width: 40,
    height: 40,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: disabled || transcribing ? 'not-allowed' : 'pointer',
    opacity: disabled || transcribing ? .5 : 1,
    padding: 0
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, position: 'relative' }}>
      {recording ? (
        <>
          <button type="button" onClick={cancel} aria-label="Annuler la dictée" title="Annuler" style={{ ...buttonStyle, fontSize: 20 }}>×</button>
          <button type="button" onClick={stop} aria-label="Arrêter la dictée" title="Arrêter et transcrire" style={{ ...buttonStyle, border: 0, background: 'var(--danger)', color: '#fff', fontSize: 14 }}>■</button>
        </>
      ) : (
        <button type="button" onClick={start} disabled={disabled || transcribing} aria-label="Dicter un message" title="Dicter un message" style={buttonStyle}>
          {transcribing ? '…' : <MicrophoneIcon />}
        </button>
      )}
      {transcribing && <span role="status" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 5, width: 250, maxWidth: '70vw', padding: 9, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>Transcription audio en cours…</span>}
      {error && <span role="status" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 5, width: 270, maxWidth: '75vw', padding: 9, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--danger)', fontSize: 11 }}>
        {error}
        {useServerFallback && !recording && !transcribing && <button type="button" onClick={startFallback} disabled={disabled} style={{ display: 'block', marginTop: 7, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Utiliser l’enregistrement de secours</button>}
      </span>}
    </div>
  );
}
