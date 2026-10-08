import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

export default function AddFriend({ token, onClose }) {
  const [ipAlias, setIpAlias] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const captchaWidgetRef = useRef(null);

  useEffect(() => {
    if (!captchaRequired) return;
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      setError('La protection anti-bot n’est pas configurée.');
      return;
    }
    const renderCaptcha = () => {
      if (!captchaRef.current || !window.turnstile || captchaWidgetRef.current !== null) return;
      captchaWidgetRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey,
        callback: value => setCaptchaToken(value),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => {
          setCaptchaToken('');
          setError('La vérification anti-bot a échoué. Réessaie.');
        }
      });
    };
    if (window.turnstile) {
      renderCaptcha();
    } else {
      const existingScript = document.querySelector('script[data-propard-turnstile]');
      if (existingScript) {
        existingScript.addEventListener('load', renderCaptcha, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.propardTurnstile = 'true';
        script.addEventListener('load', renderCaptcha, { once: true });
        document.head.appendChild(script);
      }
    }
    return () => {
      if (captchaWidgetRef.current !== null && window.turnstile) {
        window.turnstile.remove(captchaWidgetRef.current);
      }
      captchaWidgetRef.current = null;
    };
  }, [captchaRequired]);

  const sendRequest = async () => {
    if (!ipAlias.trim()) return;
    if (captchaRequired && !captchaToken) {
      setError('Valide le CAPTCHA avant de continuer.');
      return;
    }
    setError('');
    setStatus('');
    try {
      await api.post('/api/friends/add',
        { ipAlias: ipAlias.trim(), ...(captchaToken ? { captchaToken } : {}) },
        { headers: { Authorization: `Bearer ${token}` } });
      setStatus('Demande envoyée !');
      setIpAlias('');
      setCaptchaToken('');
      setCaptchaRequired(false);
    } catch (err) {
      if (err.response?.data?.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaToken('');
        if (captchaWidgetRef.current !== null && window.turnstile) {
          window.turnstile.reset(captchaWidgetRef.current);
        }
      }
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Ajouter un ami</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Entre l'adresse de ton ami</p>
        <input style={styles.input} placeholder="ex: 105.92.242.207"
          value={ipAlias} onChange={e => setIpAlias(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendRequest()} />
        {captchaRequired && <div ref={captchaRef} />}
        {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
        {status && <p style={{ color: 'var(--success)', fontSize: '13px' }}>{status}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button style={styles.sendBtn} onClick={sendRequest}>Envoyer</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-mono)' },
  cancelBtn: { flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', fontSize: '14px' },
  sendBtn: { flex: 1, background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600' }
};
