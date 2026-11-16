import { useEffect, useRef, useState } from 'react';

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export default function VoiceDictationButton({ value, onChange, disabled = false }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const cancelledRef = useRef(false);
  const stoppingRef = useRef(false);

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
    stoppingRef.current = false;

    const recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setRecording(true);
    recognition.onresult = event => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalTextRef.current += transcript;
        else interim += transcript;
      }
      const spoken = (finalTextRef.current + interim).trim();
      const base = baseTextRef.current.trim();
      onChange([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
    };
    recognition.onerror = event => {
      if (event.error !== 'aborted') {
        setError(event.error === 'not-allowed'
          ? 'Autorise le micro dans les réglages du navigateur.'
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
      const spoken = finalTextRef.current.trim();
      const base = baseTextRef.current.trim();
      onChange([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setRecording(false);
      setError('Impossible de démarrer le micro. Vérifie son autorisation.');
    }
  };

  const stop = () => {
    if (!recognitionRef.current) return;
    stoppingRef.current = true;
    recognitionRef.current.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    recognitionRef.current?.abort?.();
    setRecording(false);
    onChange(baseTextRef.current);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      {recording ? (
        <>
          <button type="button" onClick={cancel} aria-label="Annuler la dictée" title="Annuler" style={{ width: 38, height: 38, border: '1px solid var(--border)', borderRadius: 10, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 18 }}>×</button>
          <button type="button" onClick={stop} aria-label="Arrêter la dictée" title="Arrêter et garder le texte" style={{ width: 38, height: 38, border: 0, borderRadius: 10, background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 15 }}>■</button>
        </>
      ) : (
        <button type="button" onClick={start} disabled={disabled} aria-label="Dicter un message" title="Dicter un message" style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10, background: 'transparent', color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, fontSize: 18 }}>🎙</button>
      )}
      {error && <span role="status" style={{ position: 'absolute', bottom: '100%', right: 12, maxWidth: 260, padding: 8, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}
