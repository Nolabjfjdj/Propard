import { useState } from 'react';
import api from '../utils/api';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px',
  borderRadius: 8,
  border: '1px solid var(--border-color, #444)',
  background: 'var(--bg-secondary, #171717)',
  color: 'var(--text-primary, #fff)',
  marginTop: 6
};

export default function PasswordResetPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acknowledgeE2eeLoss, setAcknowledgeE2eeLoss] = useState(false);
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError('Le mot de passe doit contenir entre 8 et 128 caractères.');
      return;
    }
    if (acknowledgementRequired && !acknowledgeE2eeLoss) {
      setError('Confirme d’abord que tu comprends les conséquences pour la sauvegarde E2EE.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/staff/password-reset/complete', {
        token: token.trim(),
        newPassword: password,
        acknowledgeE2eeKeyBackupLoss: acknowledgeE2eeLoss
      });
      setNotice(response.data.message || 'Mot de passe modifié.');
      setToken('');
      setPassword('');
      setConfirmPassword('');
      setAcknowledgeE2eeLoss(false);
      setAcknowledgementRequired(false);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.e2eeBackupAcknowledgementRequired) {
        setAcknowledgementRequired(true);
        setError(err.response.data.error || 'Confirmation requise pour la sauvegarde E2EE.');
      } else {
        setError(err.response?.data?.error || 'Impossible de réinitialiser le mot de passe. Vérifie le code.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 16,
      background: 'var(--bg-primary, #101010)',
      color: 'var(--text-primary, #fff)'
    }}>
      <form onSubmit={submit} style={{
        width: '100%',
        maxWidth: 440,
        boxSizing: 'border-box',
        padding: 22,
        borderRadius: 14,
        border: '1px solid var(--border-color, #333)',
        background: 'var(--bg-secondary, #171717)'
      }}>
        <h1 style={{ marginTop: 0 }}>Récupération du compte</h1>
        <p style={{ color: 'var(--text-secondary, #aaa)' }}>
          Entre le code temporaire remis par le support. Il expire après 15 minutes et ne peut être utilisé qu’une fois.
        </p>

        <label style={{ display: 'block', marginTop: 14 }}>
          Code de récupération
          <input style={inputStyle} value={token} onChange={event => setToken(event.target.value)} autoComplete="one-time-code" required />
        </label>

        <label style={{ display: 'block', marginTop: 14 }}>
          Nouveau mot de passe
          <input style={inputStyle} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required />
        </label>

        <label style={{ display: 'block', marginTop: 14 }}>
          Confirmer le mot de passe
          <input style={inputStyle} type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required />
        </label>

        {acknowledgementRequired && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, lineHeight: 1.45 }}>
            <input
              type="checkbox"
              checked={acknowledgeE2eeLoss}
              onChange={event => setAcknowledgeE2eeLoss(event.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              Je comprends que la sauvegarde E2EE chiffrée avec mon ancien mot de passe sera supprimée. Je pourrai en recréer une uniquement depuis un appareil qui possède encore ma clé privée locale. Sans cette clé, mes anciens messages chiffrés peuvent devenir irrécupérables.
            </span>
          </label>
        )}

        {error && <p role="alert" style={{ color: '#ff8585', marginTop: 14 }}>{error}</p>}
        {notice && <p role="status" style={{ marginTop: 14 }}>{notice}</p>}

        <button type="submit" disabled={loading} style={{
          width: '100%',
          padding: 12,
          marginTop: 18,
          borderRadius: 8,
          border: 0,
          background: 'var(--accent, #5865f2)',
          color: '#fff',
          cursor: loading ? 'wait' : 'pointer'
        }}>
          {loading ? 'Vérification…' : 'Réinitialiser le mot de passe'}
        </button>
      </form>
    </main>
  );
}
