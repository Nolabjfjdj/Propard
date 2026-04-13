import { useState } from 'react';
import axios from 'axios';

export default function AddFriend({ token, onClose }) {
  const [ipAlias, setIpAlias] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const sendRequest = async () => {
    if (!ipAlias.trim()) return;
    setError(''); setStatus('');
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/friends/add`,
        { ipAlias: ipAlias.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setStatus('Demande envoyée !');
      setIpAlias('');
    } catch (err) { setError(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Ajouter un ami</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Entre l'adresse de ton ami</p>
        <input style={styles.input} placeholder="ex: 105.92.242.207"
          value={ipAlias} onChange={e => setIpAlias(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendRequest()} />
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