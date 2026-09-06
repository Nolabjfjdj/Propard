import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AuthPage({ mode: initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navigateToMode = (newMode) => {
    setMode(newMode);
    setError('');

    window.history.pushState(
      {},
      '',
      newMode === 'login' ? '/login' : '/register'
    );

    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      setError('Remplis tous les champs');
      return;
    }

    if (mode === 'register' && (!acceptTerms || !acceptPrivacy)) {
      setError(
        'Tu dois accepter les CGU et la politique de confidentialité'
      );
      return;
    }

    setError('');
    setLoading(true);

    try {
      const route =
        mode === 'login'
          ? '/api/auth/login'
          : '/api/auth/register';

      const res = await axios.post(route, {
        username,
        password
      });

      login(res.data.user, res.data.token);

      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) {
      setError(
        err.response?.data?.error || 'Erreur serveur'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">

        <div className="auth-header">
          <div className="auth-logo">
            Propard
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label="Changer de thème"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="auth-card">
          <h1>
            {mode === 'login'
              ? 'Se connecter'
              : "S'inscrire"}
          </h1>

          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Connecte-toi à ton compte Propard'
              : 'Crée ton compte Propard'}
          </p>

          <form onSubmit={handleSubmit}>

            <div className="form-group">
              <label htmlFor="username">
                Nom d'utilisateur
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Nom d'utilisateur"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                Mot de passe
              </label>

              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                  placeholder="Mot de passe"
                  disabled={loading}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  aria-label={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) =>
                      setAcceptTerms(e.target.checked)
                    }
                    disabled={loading}
                  />

                  <span>
                    J'accepte les{' '}
                    <a href="/terms">
                      CGU
                    </a>
                  </span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) =>
                      setAcceptPrivacy(e.target.checked)
                    }
                    disabled={loading}
                  />

                  <span>
                    J'accepte la{' '}
                    <a href="/privacy">
                      politique de confidentialité
                    </a>
                  </span>
                </label>
              </>
            )}

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading
                ? 'Chargement...'
                : mode === 'login'
                  ? 'Se connecter'
                  : "S'inscrire"}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => navigateToMode('register')}
                >
                  S'inscrire
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={() => navigateToMode('login')}
                >
                  Se connecter
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}