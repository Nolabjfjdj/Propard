import { useEffect, useState } from 'react';
import api from '../utils/api';
import { decryptVaultData, encryptVaultData } from '../utils/vaultCrypto';

export default function PersonalVault({ token }) {
  const [vaultExists, setVaultExists] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = { Authorization: 'Bearer ' + token };

  useEffect(() => {
    let cancelled = false;
    api.get('/api/vault', { headers })
      .then(response => {
        if (!cancelled) setVaultExists(Boolean(response.data?.vault));
      })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || 'Impossible de vérifier le coffre-fort.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const unlockVault = async () => {
    if (passphrase.length < 12) {
      setError('Utilise une phrase secrète d’au moins 12 caractères.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await api.get('/api/vault', { headers });
      const vault = response.data?.vault;
      if (!vault) {
        const initialData = { notes: [] };
        const encrypted = await encryptVaultData(initialData, passphrase);
        await api.put('/api/vault', encrypted, { headers });
        setVaultExists(true);
        setNotes([]);
        setUnlocked(true);
        setNotice('Coffre-fort créé et chiffré sur ton appareil.');
      } else {
        const data = await decryptVaultData(vault, passphrase);
        if (!data || !Array.isArray(data.notes) || data.notes.length > 50) {
          throw new Error('Le contenu du coffre-fort est invalide.');
        }
        setNotes(data.notes);
        setVaultExists(true);
        setUnlocked(true);
        setNotice('Coffre-fort déverrouillé sur cet appareil.');
      }
    } catch (err) {
      setError(err.response?.data?.error || (err.name === 'OperationError' ? 'Phrase secrète incorrecte ou coffre-fort endommagé.' : err.message) || 'Impossible de déverrouiller le coffre-fort.');
    } finally {
      setLoading(false);
    }
  };

  const saveVault = async nextNotes => {
    if (!unlocked || !passphrase) return;
    if (nextNotes.length > 50) {
      setError('Le coffre-fort est limité à 50 notes.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const encrypted = await encryptVaultData({ notes: nextNotes }, passphrase);
      await api.put('/api/vault', encrypted, { headers });
      setNotes(nextNotes);
      setNotice('Coffre-fort enregistré. Seules les données chiffrées ont été envoyées.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Impossible d’enregistrer le coffre-fort.');
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Ajoute un titre et un contenu à ta note.');
      return;
    }
    if (title.trim().length > 100 || content.length > 10000) {
      setError('Titre limité à 100 caractères et contenu à 10 000 caractères.');
      return;
    }
    const next = [...notes, {
      id: crypto.randomUUID(),
      title: title.trim(),
      content,
      updatedAt: new Date().toISOString()
    }];
    await saveVault(next);
    setTitle('');
    setContent('');
  };

  const deleteNote = async noteId => {
    await saveVault(notes.filter(note => note.id !== noteId));
  };

  const lockVault = () => {
    setUnlocked(false);
    setPassphrase('');
    setNotes([]);
    setTitle('');
    setContent('');
    setNotice('Coffre-fort verrouillé. Les notes ont été retirées de cette page.');
    setError('');
  };

  const deleteVault = async () => {
    if (!window.confirm('Supprimer définitivement le coffre-fort chiffré et toutes ses notes ?')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete('/api/vault', { headers });
      setVaultExists(false);
      setUnlocked(false);
      setPassphrase('');
      setNotes([]);
      setNotice('Coffre-fort supprimé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer le coffre-fort.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <strong>Coffre-fort personnel E2EE</strong>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Tes notes sont chiffrées dans ton navigateur avec AES-256-GCM et une phrase secrète dérivée par PBKDF2. Propard ne reçoit que le texte chiffré. Si tu oublies ta phrase secrète, le contenu ne pourra pas être récupéré.
        </p>
      </div>
      {!unlocked ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={event => setPassphrase(event.target.value)}
            placeholder="Phrase secrète (12 caractères minimum)"
            aria-label="Phrase secrète du coffre-fort"
            style={styles.input}
          />
          <button type="button" onClick={unlockVault} disabled={loading} style={styles.primary}>
            {loading ? 'Patiente…' : vaultExists ? 'Déverrouiller' : 'Créer mon coffre-fort'}
          </button>
        </div>
      ) : (
        <>
          <div style={styles.form}>
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Titre de la note" style={styles.input} />
            <textarea value={content} onChange={event => setContent(event.target.value)} maxLength={10000} rows={5} placeholder="Contenu privé…" style={styles.input} />
            <button type="button" onClick={addNote} disabled={loading || notes.length >= 50} style={styles.primary}>Ajouter une note chiffrée</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <strong>Mes notes ({notes.length}/50)</strong>
            <button type="button" onClick={lockVault} style={styles.secondary}>Verrouiller</button>
          </div>
          {notes.map(note => (
            <article key={note.id} style={styles.note}>
              <strong>{note.title}</strong>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13 }}>{note.content}</p>
              <small style={{ color: 'var(--text-muted)' }}>Modifiée le {new Date(note.updatedAt).toLocaleString()}</small>
              <button type="button" onClick={() => deleteNote(note.id)} disabled={loading} style={styles.danger}>Supprimer</button>
            </article>
          ))}
          {notes.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Ton coffre-fort est vide pour le moment.</p>}
          <button type="button" onClick={deleteVault} disabled={loading} style={styles.danger}>Supprimer tout le coffre-fort</button>
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: 'var(--success)', fontSize: 13 }}>{notice}</p>}
    </section>
  );
}

const styles = {
  form: { display: 'grid', gap: 10 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 11,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    font: 'inherit'
  },
  primary: {
    border: 0,
    borderRadius: 8,
    padding: '11px 14px',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 700
  },
  secondary: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 11px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)'
  },
  danger: {
    border: '1px solid var(--danger)',
    borderRadius: 8,
    padding: '7px 10px',
    background: 'transparent',
    color: 'var(--danger)'
  },
  note: {
    display: 'grid',
    gap: 8,
    padding: 14,
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-tertiary)'
  }
};
