import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AuthPage({ mode }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaPurpose, setCaptchaPurpose] = useState('auth');
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpType, setHelpType] = useState('password_reset');
  const [helpUsername, setHelpUsername] = useState('');
  const [helpMessage, setHelpMessage] = useState('');
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState('');
  const [helpResult, setHelpResult] = useState('');
  const [helpTracking, setHelpTracking] = useState(null);
  const captchaRef = useRef(null);
  const captchaWidgetRef = useRef(null);

  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
        callback: token => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => {
          setCaptchaToken('');
          setError('La vérification anti-bot a échoué. Réessaie.');
        }
      });
    };
    if (window.turnstile) {
      renderCaptcha();
      return;
    }
    const existingScript = document.querySelector('script[data-propard-turnstile]');
    if (existingScript) {
      existingScript.addEventListener('load', renderCaptcha, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.propardTurnstile = 'true';
    script.addEventListener('load', renderCaptcha, { once: true });
    document.head.appendChild(script);
    return () => {
      if (captchaWidgetRef.current !== null && window.turnstile) {
        window.turnstile.remove(captchaWidgetRef.current);
      }
      captchaWidgetRef.current = null;
    };
  }, [captchaRequired, mode]);

  const switchMode = (newMode) => {
    setError('');
    setShowPassword(false);
    setAcceptTerms(false);
    setAcceptPrivacy(false);

    window.location.href =
      newMode === 'login' ? '/login' : '/register';
  };

  const openHelp = kind => {
    setHelpType(kind);
    setHelpUsername(username.trim());
    setHelpMessage('');
    setHelpError('');
    setHelpResult('');
    setHelpTracking(null);
    setHelpOpen(true);
  };

  const submitHelp = async event => {
    event.preventDefault();
    setHelpError('');
    setHelpResult('');
    setHelpTracking(null);
    if (helpMessage.trim().length < 20) {
      setHelpError('Explique pourquoi tu demandes cette aide en au moins 20 caractères.');
      return;
    }
    setHelpLoading(true);
    try {
      const response = await api.post('/api/auth/account-help', {
        username: helpUsername.trim(),
        kind: helpType,
        message: helpMessage.trim()
      });
      window.location.href = `/support/${response.data.reference}#${response.data.accessToken}`;
    } catch (err) {
      setHelpError(err.response?.data?.error || 'Impossible d’envoyer la demande.');
    } finally {
      setHelpLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!username || !password) {
      return setError('Remplis tous les champs');
    }

    if (mode === 'register' && (!acceptTerms || !acceptPrivacy)) {
      return setError(
        'Tu dois accepter les CGU et la politique de confidentialité'
      );
    }

    if (captchaRequired && !captchaToken) {
      return setError('Valide le CAPTCHA avant de continuer.');
    }

    setError('');
    setLoading(true);

    try {
      const route =
        mode === 'login'
          ? '/api/auth/login'
          : '/api/auth/register';

      const authCaptchaToken = captchaPurpose === 'auth' && captchaToken ? captchaToken : '';
      const e2eeCaptchaToken = captchaPurpose === 'e2ee' ? captchaToken : '';
      const res = await api.post(route, {
        username,
        password,
        ...(authCaptchaToken ? { captchaToken: authCaptchaToken } : {})
      });

      await login(
        res.data.user,
        res.data.token,
        password,
        e2eeCaptchaToken
      );

      // Mémorise que ce navigateur a déjà utilisé Propard.
      // Cela permet de savoir quelle page afficher après une déconnexion.
      localStorage.setItem('propard_has_logged_in', 'true');

      window.location.href = '/';
    } catch (err) {
      const requiresCaptcha = err.response?.data?.captchaRequired === true;
      if (requiresCaptcha) {
        setCaptchaRequired(true);
        const failedUrl = err.response?.config?.url || '';
        setCaptchaPurpose(failedUrl.includes('/api/auth/keybackup') || failedUrl.includes('/api/auth/publickey') ? 'e2ee' : 'auth');
      }
      // Les jetons Turnstile sont à usage unique : réinitialise le widget après
      // toute tentative échouée afin qu'il ne reste pas bloqué sur « succès ».
      if (captchaRequired || requiresCaptcha) {
        setCaptchaToken('');
        if (captchaWidgetRef.current !== null && window.turnstile) {
          window.turnstile.reset(captchaWidgetRef.current);
        }
      }
      setError(err.response?.data?.error || 'Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <button onClick={toggleTheme} style={styles.themeBtn}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={styles.logoText}>Propard</span>

          <span
            style={{
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: '32px',
              fontWeight: 700
            }}
          >
            .
          </span>
        </div>

        <p style={styles.subtitle}>
          {mode === 'login'
            ? 'Content de te revoir'
            : 'Crée ton compte'}
        </p>

        <div style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Pseudo"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e =>
              e.key === 'Enter' && handleSubmit()
            }
          />

          <div style={{ position: 'relative' }}>
            <input
              style={{
                ...styles.input,
                width: '100%',
                paddingRight: '44px'
              }}
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e =>
                e.key === 'Enter' && handleSubmit()
              }
            />

            <button
              style={styles.eyeBtn}
              onClick={() =>
                setShowPassword(!showPassword)
              }
              type="button"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {mode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: 13, marginTop: -2 }}>
              <button type="button" style={styles.helpLink} onClick={() => openHelp('password_reset')}>Mot de passe oublié ?</button>
              <button type="button" style={styles.helpLink} onClick={() => openHelp('support')}>Contacter le support</button>
            </div>
          )}

          {mode === 'register' && (
            <div style={styles.checkboxes}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={e =>
                    setAcceptTerms(e.target.checked)
                  }
                  style={styles.checkbox}
                />

                <span style={styles.checkboxText}>
                  J'accepte les{' '}

                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    style={styles.checkboxLink}
                  >
                    Conditions d'utilisation
                  </a>
                </span>
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={acceptPrivacy}
                  onChange={e =>
                    setAcceptPrivacy(e.target.checked)
                  }
                  style={styles.checkbox}
                />

                <span style={styles.checkboxText}>
                  J'accepte la{' '}

                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    style={styles.checkboxLink}
                  >
                    Politique de confidentialité
                  </a>
                </span>
              </label>
            </div>
          )}

          {captchaRequired && (
            <div
              ref={captchaRef}
              style={{ display: 'flex', justifyContent: 'center' }}
            />
          )}

          {error && (
            <p
              style={{
                color: 'var(--danger)',
                fontSize: '13px',
                textAlign: 'center'
              }}
            >
              {error}
            </p>
          )}

          <button
            style={{
              ...styles.btn,
              opacity: loading ? 0.7 : 1
            }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading
              ? '...'
              : mode === 'login'
                ? 'Se connecter'
                : "S'inscrire"}
          </button>
        </div>

        <p style={styles.switchText}>
          {mode === 'login'
            ? 'Pas encore de compte ? '
            : 'Déjà un compte ? '}

          <span
            style={styles.switchLink}
            onClick={() =>
              switchMode(
                mode === 'login'
                  ? 'register'
                  : 'login'
              )
            }
          >
            {mode === 'login'
              ? "S'inscrire"
              : 'Se connecter'}
          </span>
        </p>
      </div>

      {helpOpen && (
        <div style={styles.modalBackdrop} role="presentation">
          <form style={styles.helpModal} onSubmit={submitHelp}>
            <button type="button" aria-label="Fermer" style={styles.modalClose} onClick={() => setHelpOpen(false)}>×</button>
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)' }}>
              {helpType === 'password_reset' ? 'Mot de passe oublié' : 'Contacter le support'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              Ta demande sera visible dans le panneau du personnel Propard. Aucun e-mail ne sera envoyé.
              {helpType === 'password_reset' ? ' Le personnel vérifiera les informations avant de fournir un code temporaire.' : ''}
            </p>
            <label style={styles.helpLabel}>Pseudo Propard
              <input style={styles.input} value={helpUsername} onChange={event => setHelpUsername(event.target.value)} minLength={3} maxLength={20} autoComplete="username" required />
            </label>
            <label style={styles.helpLabel}>
              {helpType === 'password_reset' ? 'Explique pourquoi tu es le propriétaire de ce compte' : 'Explique ta demande au support et comment vérifier que le compte est bien le tien'}
              <textarea
                style={{ ...styles.input, minHeight: 130, resize: 'vertical', fontFamily: 'inherit' }}
                value={helpMessage}
                onChange={event => setHelpMessage(event.target.value)}
                minLength={20}
                maxLength={1500}
                placeholder={helpType === 'password_reset' ? 'Donne des détails permettant au personnel de vérifier que le compte t’appartient. Ne donne jamais ton ancien mot de passe.' : 'Décris le problème et ajoute des détails permettant de vérifier ton lien avec le compte si nécessaire.'}
                required
              />
            </label>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px' }}>
              Ne communique jamais ton mot de passe. Le message est une preuve à examiner, pas une vérification automatique.
            </p>
            {helpError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{helpError}</p>}
            {helpResult && <p role="status" style={{ color: 'var(--success)', fontSize: 13 }}>{helpResult}</p>}
            {helpTracking && (
              <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, display: 'grid', gap: 8 }}>
                <strong>Garde ces informations : elles ne seront plus affichées après fermeture.</strong>
                <label style={styles.helpLabel}>Référence
                  <code style={{ overflowWrap: 'anywhere' }}>{helpTracking.reference}</code>
                </label>
                <label style={styles.helpLabel}>Clé privée de suivi
                  <code style={{ overflowWrap: 'anywhere' }}>{helpTracking.accessToken}</code>
                </label>
                <button type="button" style={{ ...styles.btn, width: '100%' }} onClick={() => navigator.clipboard?.writeText(`Référence : ${helpTracking.reference}\nClé de suivi : ${helpTracking.accessToken}`)}>
                  Copier les informations de suivi
                </button>
                <a href="/account-help-status" style={{ color: 'var(--accent)', textAlign: 'center' }}>Consulter la réponse du personnel</a>
              </div>
            )}
            <button type="submit" style={{ ...styles.btn, width: '100%' }} disabled={helpLoading}>
              {helpLoading ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    position: 'relative'
  },

  themeBtn: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '18px'
  },

  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: 'var(--shadow)'
  },

  logoText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--text-primary)'
  },

  subtitle: {
    textAlign: 'center',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
    fontSize: '14px'
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },

  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    boxSizing: 'border-box'
  },

  eyeBtn: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px'
  },

  checkboxes: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px'
  },

  checkboxLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    cursor: 'pointer'
  },

  checkbox: {
    marginTop: '2px',
    flexShrink: 0,
    accentColor: 'var(--accent)',
    width: '15px',
    height: '15px',
    cursor: 'pointer'
  },

  checkboxText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4'
  },

  checkboxLink: {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontWeight: '600'
  },

  btn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '8px',
    padding: '13px',
    fontSize: '15px',
    fontWeight: '600',
    marginTop: '4px'
  },

  helpLink: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    overflowY: 'auto'
  },

  helpModal: {
    position: 'relative',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '28px 24px',
    width: '100%',
    maxWidth: 460,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: 'var(--shadow)'
  },

  modalClose: {
    position: 'absolute',
    top: 10,
    right: 12,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 25,
    cursor: 'pointer'
  },

  helpLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    marginBottom: 14,
    color: 'var(--text-secondary)',
    fontSize: 13
  },

  switchText: {
    marginTop: '20px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '13px'
  },

  switchLink: {
    color: 'var(--accent)',
    cursor: 'pointer',
    fontWeight: '600'
  }
};