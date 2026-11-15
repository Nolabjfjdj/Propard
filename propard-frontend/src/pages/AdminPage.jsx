import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [acknowledgeE2eeKeyBackupLoss, setAcknowledgeE2eeKeyBackupLoss] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaContainerRef = useRef(null);
  const captchaWidgetRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('propard_token');
    if (!token) {
      setAccessLoading(false);
      return;
    }
    api.get('/api/admin/access', {
      headers: { Authorization: 'Bearer ' + token },
      validateStatus: () => true
    }).then(response => {
      if (active) setHasAccess(response.status === 200 && response.data?.owner === true);
    }).catch(() => {
      if (active) setHasAccess(false);
    }).finally(() => {
      if (active) setAccessLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!captchaRequired) return;
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    const renderCaptcha = () => {
      if (!captchaContainerRef.current || !window.turnstile || captchaWidgetRef.current !== null) return;
      captchaWidgetRef.current = window.turnstile.render(captchaContainerRef.current, {
        sitekey: siteKey,
        callback: value => setCaptchaToken(value),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken('')
      });
    };

    if (window.turnstile) renderCaptcha();
    else {
      const existingScript = document.querySelector('script[data-propard-turnstile]');
      if (existingScript) existingScript.addEventListener('load', renderCaptcha, { once: true });
      else {
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
      if (captchaWidgetRef.current !== null && window.turnstile) window.turnstile.remove(captchaWidgetRef.current);
      captchaWidgetRef.current = null;
    };
  }, [captchaRequired]);

  const handleReset = async event => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!adminKey || !username.trim() || !newPassword) {
      setError('Remplis tous les champs.');
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError('Valide le CAPTCHA avant de continuer.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('propard_token');
      const response = await api.post('/api/admin/reset-password', {
        adminKey,
        username: username.trim(),
        newPassword,
        acknowledgeE2eeKeyBackupLoss,
        ...(captchaToken ? { captchaToken } : {})
      }, {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });

      setNotice(response.data.message || 'Mot de passe réinitialisé.');
      setUsername('');
      setNewPassword('');
      setAcknowledgeE2eeKeyBackupLoss(false);
      if (captchaToken) {
        setCaptchaRequired(false);
        setCaptchaToken('');
      }
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.error || 'Erreur lors de la réinitialisation.');
      if (data.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaToken('');
      } else if (captchaRequired) {
        setCaptchaToken('');
        if (captchaWidgetRef.current !== null && window.turnstile) window.turnstile.reset(captchaWidgetRef.current);
      }
      if (data.e2eeBackupAcknowledgementRequired) setAcknowledgeE2eeKeyBackupLoss(true);
    } finally {
      setLoading(false);
    }
  };

  if (accessLoading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-primary)' }}>Vérification des accès…</main>;
  }

  if (!hasAccess) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, color: 'var(--text-primary)', background: 'var(--bg-primary)' }}>
        <section style={{ maxWidth: 460, padding: 24, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
          <h1>Accès refusé</h1>
          <p>Ce panneau est réservé au propriétaire unique de Propard.</p>
          <a href="/" style={{ color: 'var(--text-secondary)' }}>← Retour</a>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
      <section style={{ maxWidth: 620, margin: '0 auto', padding: 24, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
        <h1 style={{ marginTop: 0 }}>Admin Propard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Outil privé réservé au propriétaire unique. Cette page ne contient que la réinitialisation des mots de passe.</p>
        {captchaRequired && (
          <div style={{ marginBottom: 16 }}>
            <p>Vérification anti-bot requise.</p>
            <div ref={captchaContainerRef} />
            {!import.meta.env.VITE_TURNSTILE_SITE_KEY && <p style={{ color: 'var(--danger)' }}>La clé publique Turnstile n’est pas configurée.</p>}
          </div>
        )}
        <form onSubmit={handleReset} style={{ display: 'grid', gap: 12 }}>
          <label>Clé admin
            <input type="password" autoComplete="off" value={adminKey} onChange={event => setAdminKey(event.target.value)} required style={fieldStyle} />
          </label>
          <label>Nom du compte
            <input type="text" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} required style={fieldStyle} />
          </label>
          <label>Nouveau mot de passe
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="checkbox" checked={acknowledgeE2eeKeyBackupLoss} onChange={event => setAcknowledgeE2eeKeyBackupLoss(event.target.checked)} />
            Je comprends que la sauvegarde E2EE de ce compte sera supprimée si elle est chiffrée avec l’ancien mot de passe.
          </label>
          {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          {notice && <p role="status" style={{ color: 'var(--success)', margin: 0 }}>{notice}</p>}
          <button type="submit" disabled={loading} style={buttonStyle}>{loading ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}</button>
        </form>
        <a href="/" style={{ display: 'inline-block', marginTop: 20, color: 'var(--text-secondary)' }}>← Retour</a>
      </section>
    </main>
  );
}

const fieldStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 6,
  padding: '11px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)'
};

const buttonStyle = {
  padding: '12px 14px',
  border: 0,
  borderRadius: 8,
  background: 'var(--accent)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer'
};
