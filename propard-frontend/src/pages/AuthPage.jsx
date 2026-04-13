import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async () => {
    if (!username || !password) return setError('Remplis tous les champs');
    setError('');
    setLoading(true);
    try {
      const route = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await axios.post(`${import.meta.env.VITE_API_URL}${route}`, { username, password });
      login(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <button onClick={toggleTheme} style={styles.themeBtn}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={styles.logoText}>Propard</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700 }}>.</span>
        </div>
        <p style={styles.subtitle}>{mode === 'login' ? 'Content de te revoir' : 'Crée ton compte'}</p>
        <div style={styles.form}>
          <input style={styles.input} type="text" placeholder="Username"
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          <input style={styles.input} type="password" placeholder="Mot de passe"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center' }}>{error}</p>}
          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? '...' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        </div>
        <p style={styles.switchText}>
          {mode === 'login' ? "Pas encore de compte ? " : "Déjà un compte ? "}
          <span style={styles.switchLink} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? "S'inscrire" : "Se connecter"}
          </span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', position: 'relative' },
  themeBtn: { position: 'absolute', top: '20px', right: '20px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '18px' },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '48px 40px', width: '100%', maxWidth: '400px', boxShadow: 'var(--shadow)' },
  logoText: { fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)' },
  subtitle: { textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '14px' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px' },
  btn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '13px', fontSize: '15px', fontWeight: '600', marginTop: '4px' },
  switchText: { marginTop: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' },
  switchLink: { color: 'var(--accent)', cursor: 'pointer', fontWeight: '600' }
};