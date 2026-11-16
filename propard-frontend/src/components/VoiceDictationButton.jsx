import { useEffect, useRef, useState } from 'react';

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const normalizeTranscript = text => {
  return text
    .replace(/\bprodromes\s+ai\b/gi, 'Propard AI')
    .replace(/\bpro\s*pard\s+ai\b/gi, 'Propard AI')
    .replace(/\bpropard\s+a[iï]\b/gi, 'Propard AI')
    .replace(/\bpropard\b/gi, 'Propard');
};

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="9" y="2.5" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function VoiceDictationButton({ value, onChange, disabled = false }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const cancelledRef = useRef(false);

  useEffect(() => () => {
    cancelledRef.current = true;
    recognitionRef.current?.abort?.();
  }, []);

  const start = () => {
    const Recognition = getRecognition();
    if (!Recognition) {
      setError('La dictée vocale n’est pas prise en charge par ce navigateur.');
      return;
    }

    setError('');
    baseTextRef.current = value || '';
    finalTextRef.current = '';
    cancelledRef.current = false;

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

    recognition.onstart = () => setRecording(true);
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
          ? 'Autorise le micro dans les réglages du navigateur.'
          : event.error === 'no-speech'
            ? 'Aucune voix détectée. Réessaie en parlant un peu plus près du micro.'
            : 'Erreur pendant la dictée vocale.');
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
      setRecording(false);
      setError('Impossible de démarrer le micro. Vérifie son autorisation.');
      recognitionRef.current = null;
    }
  };

  const stop = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setRecording(false);
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
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .5 : 1,
    padding: 0
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, position: 'relative' }}>
      {recording ? (
        <>
          <button type="button" onClick={cancel} aria-label="Annuler la dictée" title="Annuler" style={{ ...buttonStyle, fontSize: 20 }}>×</button>
          <button type="button" onClick={stop} aria-label="Arrêter la dictée" title="Arrêter et garder le texte" style={{ ...buttonStyle, border: 0, background: 'var(--danger)', color: '#fff', fontSize: 14 }}>■</button>
        </>
      ) : (
        <button type="button" onClick={start} disabled={disabled} aria-label="Dicter un message" title="Dicter un message" style={buttonStyle}>
          <MicrophoneIcon />
        </button>
      )}
      {error && <span role="status" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 5, width: 250, maxWidth: '70vw', padding: 9, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}
