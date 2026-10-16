import { useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function ContactPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const name = user?.username || 'Anonyme';

  const handleSend = async () => {
    if (message.trim().length < 20) {
      setError('Décris ta demande en au moins 20 caractères, en précisant comment vérifier que le compte t’appartient.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/account-help', {
        username: name,
        kind: 'support',
        message: message.trim()
      });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’envoyer la demande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/help" style={styles.back}>← Retour à l'aide</a>
        <h1 style={styles.title}>Nous contacter</h1>
        <p style={styles.subtitle}>Ta demande sera transmise au panneau du personnel Propard. Aucun e-mail ne sera envoyé.</p>
        {sent ? (
          <div style={styles.success}>
            ✅ Ta demande a été envoyée au panneau du personnel. Tu peux fermer cette page.
          </div>
        ) : (
          <div style={styles.form}>
            <label style={styles.label}>Ton pseudo</label>
            <div style={styles.lockedInput}>
              {name}
            </div>
            <label style={styles.label}>Ton message</label>
            <textarea
              style={styles.textarea}
              placeholder="Décris le problème, et explique comment le personnel peut vérifier que le compte est bien le tien..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              minLength={20}
              maxLength={1500}
            />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>N’envoie jamais ton mot de passe. Le personnel examinera les informations fournies.</p>
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
            <button style={styles.btn} onClick={handleSend} disabled={loading}>
              {loading ? 'Envoi…' : '📨 Envoyer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center', padding: '40px 16px' },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px', width: '100%', maxWidth: '500px', height: 'fit-content' },
  back: { fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'block', marginBottom: '24px' },
  title: { fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' },
  lockedInput: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-muted)', fontSize: '14px', fontWeight: '600' },
  textarea: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px', resize: 'vertical', fontFamily: 'var(--font-body)' },
  btn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '13px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', border: 'none' },
  success: { background: 'rgba(91, 240, 122, 0.1)', border: '1px solid var(--success)', borderRadius: '8px', padding: '16px', color: 'var(--success)', fontSize: '14px' }
};
