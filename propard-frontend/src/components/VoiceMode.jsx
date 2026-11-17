import { useEffect, useRef, useState } from 'react';

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const normalizeTranscript = value => String(value || '')
  .replace(/\bpro\s*dromes?\s+ai\b/gi, 'Propard AI')
  .replace(/\bpro\s*part\s+ai\b/gi, 'Propard AI')
  .replace(/\bpropard\s+ia\b/gi, 'Propard AI')
  .replace(/\bpropard\s+ai\b/gi, 'Propard AI')
  .replace(/\bla\s*banane\s*415\b/gi, 'LaBanane415')
  .replace(/\bbanane\s*vr\b/gi, 'BananeVR');

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function VoiceMode({ onSend, sending }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('classic');
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(() => {
    try { return localStorage.getItem('propard_ai_voice') || ''; } catch { return ''; }
  });
  const [rate, setRate] = useState(() => {
    try { return Number(localStorage.getItem('propard_ai_voice_rate')) || 1; } catch { return 1; }
  });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const recognitionRef = useRef(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const transcriptRef = useRef('');
  const modeRef = useRef(mode);
  const restartRef = useRef(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!open) return undefined;
    const loadVoices = () => {
      const available = window.speechSynthesis?.getVoices?.() || [];
      setVoices(available);
      if (!voiceURI && available.length) {
        const french = available.find(item => item.lang?.toLowerCase().startsWith('fr'));
        if (french) setVoiceURI(french.voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
  }, [open, voiceURI]);

  useEffect(() => () => {
    activeRef.current = false;
    window.clearTimeout(restartRef.current);
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel?.();
  }, []);

  const selectedVoice = () => voices.find(item => item.voiceURI === voiceURI) || voices.find(item => item.lang?.toLowerCase().startsWith('fr')) || voices[0] || null;

  const speak = text => new Promise(resolve => {
    if (!text || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 12000));
    const voice = selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'fr-FR';
    utterance.rate = rate;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => { setSpeaking(false); resolve(); };
    utterance.onerror = () => { setSpeaking(false); resolve(); };
    window.speechSynthesis.speak(utterance);
  });

  const stop = () => {
    activeRef.current = false;
    setActive(false);
    processingRef.current = false;
    window.clearTimeout(restartRef.current);
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel?.();
    setListening(false);
    setSpeaking(false);
    setStatus('Mode vocal arrêté.');
  };

  const sendRecognizedText = async text => {
    const cleaned = text.trim();
    if (!cleaned || processingRef.current) return;
    processingRef.current = true;
    setStatus('Propard AI prépare sa réponse…');
    try {
      const answer = await onSend(cleaned);
      if (answer) await speak(answer);
      if (modeRef.current === 'direct' && activeRef.current) {
        setStatus('Je t’écoute…');
        processingRef.current = false;
        restartRef.current = window.setTimeout(() => startRecognition(), 350);
      } else {
        processingRef.current = false;
        setStatus(answer ? 'Réponse terminée.' : 'Aucune réponse reçue.');
      }
    } catch {
      processingRef.current = false;
      setStatus('Impossible d’envoyer le message vocal.');
    }
  };

  const startRecognition = () => {
    const Recognition = getRecognition();
    if (!Recognition) {
      setStatus('La reconnaissance vocale n’est pas prise en charge par ce navigateur. Essaie Chrome ou un navigateur compatible.');
      return;
    }
    if (!activeRef.current || processingRef.current || sending) return;
    const recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    transcriptRef.current = '';
    recognition.onstart = () => setListening(true);
    recognition.onresult = event => {
      const alternatives = Array.from(event.results?.[0] || []);
      const preferred = alternatives.find(item => /\b(?:propard|pro\s*dromes?)\s+ai\b/i.test(item.transcript))
        || alternatives[0];
      transcriptRef.current = normalizeTranscript(preferred?.transcript || '');
      setListening(false);
      if (modeRef.current === 'direct') {
        recognition.stop();
        sendRecognizedText(transcriptRef.current);
      }
    };
    recognition.onerror = event => {
      setListening(false);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        activeRef.current = false;
        setActive(false);
        setStatus('Erreur du micro : ' + event.error);
      }
    };
    recognition.onend = () => {
      setListening(false);
      if (modeRef.current === 'classic') {
        activeRef.current = false;
        setActive(false);
        if (transcriptRef.current) sendRecognizedText(transcriptRef.current);
      } else if (modeRef.current === 'direct' && activeRef.current && !processingRef.current) {
        restartRef.current = window.setTimeout(() => startRecognition(), 450);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus(modeRef.current === 'direct' ? 'Je t’écoute…' : 'Parle maintenant…');
    } catch {
      activeRef.current = false;
      setActive(false);
      setStatus('Impossible de démarrer le micro. Vérifie son autorisation.');
    }
  };

  const start = selectedMode => {
    if (sending) return;
    stop();
    modeRef.current = selectedMode;
    setMode(selectedMode);
    activeRef.current = true;
    setActive(true);
    processingRef.current = false;
    startRecognition();
  };

  const saveVoice = value => {
    setVoiceURI(value);
    try { localStorage.setItem('propard_ai_voice', value); } catch (error) { console.warn('Impossible de sauvegarder la voix choisie:', error.message); }
  };

  const saveRate = value => {
    setRate(value);
    try { localStorage.setItem('propard_ai_voice_rate', String(value)); } catch (error) { console.warn('Impossible de sauvegarder la vitesse vocale:', error.message); }
  };

  const preview = () => speak('Bonjour, je suis Propard AI. Comment puis-je t’aider aujourd’hui ?');

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setStatus('Choisis un mode vocal pour commencer.'); }} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '7px 10px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 650 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><MicrophoneIcon /> Mode vocal</span>
      </button>
      {open && <div role="dialog" aria-modal="true" aria-label="Mode vocal Propard AI" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.62)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <section style={{ width: '100%', maxWidth: 440, maxHeight: '90dvh', overflowY: 'auto', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 18, padding: 20, boxShadow: '0 20px 70px rgba(0,0,0,.35)' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong style={{ fontSize: 18 }}>Mode vocal</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Propard AI</div>
            </div>
            <button type="button" onClick={() => { stop(); setOpen(false); }} aria-label="Fermer" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>✕</button>
          </header>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 20 }}>
            <button type="button" onClick={() => start('classic')} disabled={sending} style={{ padding: 12, borderRadius: 11, border: '1px solid var(--border)', background: mode === 'classic' ? 'var(--accent-glow)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
              <strong>Micro classique</strong>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>Tu parles, l’IA répond.</div>
            </button>
            <button type="button" onClick={() => start('direct')} disabled={sending} style={{ padding: 12, borderRadius: 11, border: '1px solid var(--border)', background: mode === 'direct' ? 'var(--accent-glow)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
              <strong>Conversation directe</strong>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>Échange vocal continu.</div>
            </button>
          </div>
          <div style={{ marginTop: 20 }}>
            <label htmlFor="propard-voice-select" style={{ display: 'block', fontSize: 13, fontWeight: 650, marginBottom: 7 }}>Voix de Propard AI</label>
            <select id="propard-voice-select" value={voiceURI} onChange={event => saveVoice(event.target.value)} style={{ width: '100%', padding: 11, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              {!voices.length && <option value="">Voix par défaut de l’appareil</option>}
              {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
            </select>
            <button type="button" onClick={preview} disabled={!window.speechSynthesis} style={{ marginTop: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>▶ Écouter un aperçu</button>
          </div>
          <div style={{ marginTop: 18 }}>
            <label htmlFor="propard-voice-rate" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 7 }}>
              <span>Vitesse de parole</span><strong>{rate.toFixed(2)}×</strong>
            </label>
            <input id="propard-voice-rate" type="range" min="0.75" max="1.25" step="0.05" value={rate} onChange={event => saveRate(Number(event.target.value))} style={{ width: '100%' }} />
          </div>
          <div aria-live="polite" style={{ marginTop: 18, padding: 12, borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 13 }}>
            {listening ? '🎙️ Micro actif, je t’écoute…' : speaking ? '🔊 Propard AI parle…' : status}
          </div>
          {(listening || speaking || active) && <button type="button" onClick={stop} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 9, padding: 12, background: 'var(--danger)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Arrêter le mode vocal</button>}
          <p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5, margin: '14px 0 0' }}>La voix et la reconnaissance sont fournies par le navigateur et l’appareil. La disponibilité des voix et du micro dépend du navigateur. L’audio n’est pas enregistré par Propard.</p>
        </section>
      </div>}
    </>
  );
}
