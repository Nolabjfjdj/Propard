import { useState } from 'react';
import axios from 'axios';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!adminKey || !username || !newPassword) return setError('Remplis tous les champs');
    setError(''); setResult('');
    setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/reset-password`, {
        adminKey, username, newPassword
      });
      setResult(res.data.message);
      setUsername(''); setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚙️ Admin Propard</h1>
        <p style={styles.subtitle}>Réinitialisation de mot de passe</p>

        <div style={styles.form}>
          <label style={styles.label}>Clé admin</label>
          <input style={styles.input} type="password" placeholder="Clé secrète"
            value={adminKey} onChange={e => setAdminKey(e.target.value)} />

          <label style={styles.label}>Username du compte</label>
          <input style={styles.input} type="text" placeholder="Ex: BananeVR"
            value={username} onChange={e => setUsername(e.target.value)} />

          <label style={styles.label}>Nouveau mot de passe</label>
          <input style={styles.input} type="password" placeholder="Nouveau mot de passe"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />

          {error && <p style={styles.error}>{error}</p>}
          {result && <p style={styles.success}>✅ {result}</p>}

          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleReset} disabled={loading}>
            {loading ? '...' : 'Réinitialiser'}
          </button>
        </div>

        <a href="/" style={styles.back}>← Retour</a>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px', width: '100%', maxWidth: '400px' },
  title: { fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' },
  input: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px' },
  btn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '13px', fontSize: '15px', fontWeight: '600', border: 'none', cursor: 'pointer', marginTop: '8px' },
  error: { color: 'var(--danger)', fontSize: '13px' },
  success: { color: 'var(--success)', fontSize: '13px' },
  back: { display: 'block', marginTop: '20px', fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }
};
