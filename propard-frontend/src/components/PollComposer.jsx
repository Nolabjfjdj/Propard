import React, { useState } from 'react';

export default function PollComposer({ onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);
  const [error, setError] = useState('');

  const updateOption = (index, value) => {
    setOptions(previous => previous.map((option, i) => i === index ? value.slice(0, 80) : option));
  };

  const submit = async () => {
    const cleanQuestion = question.trim();
    const cleanOptions = options.map(option => option.trim()).filter(Boolean);
    if (cleanQuestion.length < 3 || cleanOptions.length < 2 || cleanOptions.length > 6) {
      setError('Ajoute une question et au moins deux réponses.');
      return;
    }
    if (new Set(cleanOptions.map(option => option.toLowerCase())).size !== cleanOptions.length) {
      setError('Chaque réponse doit être différente.');
      return;
    }
    setSaving(true);
    setError('');
    let success = false;
    try {
      success = await onCreate(cleanQuestion, cleanOptions, expiresIn);
    } catch (err) {
      setError(err.message || 'Impossible de créer le sondage.');
    } finally {
      setSaving(false);
    }
    if (success) onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Créer un sondage" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10003, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.72)' }}>
      <section onClick={event => event.stopPropagation()} style={{ width: 'min(520px, 100%)', padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Créer un sondage</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>La question et les réponses sont chiffrées avant l’envoi.</p>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Question</label>
        <input value={question} onChange={event => setQuestion(event.target.value.slice(0, 200))} maxLength={200} placeholder="Ta question..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
        <label style={{ display: 'block', fontSize: 12, marginTop: 16, marginBottom: 6 }}>Durée du sondage</label>
        <select value={expiresIn} onChange={event => setExpiresIn(Number(event.target.value))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          <option value={0}>Aucune expiration</option>
          <option value={3600}>1 heure</option>
          <option value={86400}>24 heures</option>
          <option value={604800}>7 jours</option>
        </select>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Réponses</strong>
          <small style={{ color: 'var(--text-secondary)' }}>{options.length}/6</small>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {options.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: 8 }}>
              <input value={option} onChange={event => updateOption(index, event.target.value)} maxLength={80} placeholder={'Réponse ' + (index + 1)} style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
              {options.length > 2 && <button type="button" onClick={() => setOptions(previous => previous.filter((_, i) => i !== index))} aria-label="Supprimer cette réponse" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>×</button>}
            </div>
          ))}
        </div>
        {options.length < 6 && <button type="button" onClick={() => setOptions(previous => [...previous, ''])} style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>+ Ajouter une réponse</button>}
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Annuler</button>
          <button type="button" onClick={submit} disabled={saving} style={{ border: 0, borderRadius: 8, padding: '9px 14px', background: 'var(--accent)', color: '#fff', fontWeight: 650 }}>{saving ? 'Création…' : 'Créer le sondage'}</button>
        </div>
      </section>
    </div>
  );
}
