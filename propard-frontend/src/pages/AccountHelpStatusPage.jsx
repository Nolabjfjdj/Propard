import { useState } from 'react';
import api from '../utils/api';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px',
  borderRadius: 8,
  border: '1px solid var(--border, #444)',
  background: 'var(--bg-tertiary, #222)',
  color: 'var(--text-primary, #fff)',
  marginTop: 6
};

export default function AccountHelpStatusPage() {
  const [reference, setReference] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async event => {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const response = await api.post('/api/auth/account-help/status', {
        reference: reference.trim(),
        accessToken: accessToken.trim()
      });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de consulter la demande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg-primary, #101010)', color: 'var(--text-primary, #fff)' }}>
      <section style={{ width: '100%', maxWidth: 520, boxSizing: 'border-box', padding: 24, borderRadius: 14, border: '1px solid var(--border, #333)', background: 'var(--bg-secondary, #171717)' }}>
        <a href="/login" style={{ color: 'var(--accent)' }}>← Retour à la connexion</a>
        <h1>Suivi d’une demande</h1>
        <p style={{ color: 'var(--text-secondary, #aaa)', lineHeight: 1.5 }}>Entre la référence et la clé privée affichées lors de l’envoi de ta demande. Sans ces deux informations, personne ne peut consulter sa réponse.</p>
        <form onSubmit={lookup} style={{ display: 'grid', gap: 12 }}>
          <label>Référence
            <input style={inputStyle} value={reference} onChange={event => setReference(event.target.value)} autoCapitalize="characters" maxLength={16} required />
          </label>
          <label>Clé privée de suivi
            <input style={inputStyle} value={accessToken} onChange={event => setAccessToken(event.target.value)} autoComplete="off" required />
          </label>
          {error && <p role="alert" style={{ color: 'var(--danger, #f66)' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: 12, border: 0, borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>
            {loading ? 'Recherche…' : 'Consulter la demande'}
          </button>
        </form>
        {result && (
          <section style={{ marginTop: 20, padding: 14, border: '1px solid var(--border, #444)', borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Demande @{result.username}</h2>
            <p>Type : {result.kind === 'password_reset' ? 'Récupération de compte' : 'Support'}</p>
            <p>Statut : {result.status === 'new' ? 'Nouvelle' : result.status === 'in_progress' ? 'En cours de traitement' : 'Résolue'}</p>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.staffReply || 'Le personnel n’a pas encore répondu. Consulte à nouveau cette page plus tard.'}</p>
            {result.recoveryCode && (
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--accent)' }}>
                <strong>Ton code de récupération (expire le {new Date(result.recoveryCodeExpiresAt).toLocaleString()})</strong>
                <code style={{ display: 'block', margin: '10px 0', overflowWrap: 'anywhere', userSelect: 'all' }}>{result.recoveryCode}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(result.recoveryCode)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border, #444)', background: 'var(--bg-tertiary, #222)', color: 'var(--text-primary, #fff)' }}>Copier le code</button>
                <p>Ouvre ensuite <a href="/password-reset" style={{ color: 'var(--accent)' }}>/password-reset</a> pour choisir un nouveau mot de passe. Ne partage pas ce code.</p>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
