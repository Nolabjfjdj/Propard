import React, { useEffect, useState } from 'react';
import api from '../utils/api';

function canonicalKey(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || parsed.kty !== 'EC' || parsed.crv !== 'P-256' || typeof parsed.x !== 'string' || typeof parsed.y !== 'string') {
    throw new Error('Une clé publique valide est nécessaire pour vérifier cette conversation.');
  }
  return JSON.stringify(Object.fromEntries(Object.keys(parsed).sort().map(key => [key, parsed[key]])));
}

function formatFingerprint(bytes) {
  const hex = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.match(/.{1,4}/g)?.join(' ') || hex;
}

export default function E2EEVerification({ scope, token, encryptionKey, friendPublicKey, keyVersion = 1 }) {
  const [open, setOpen] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !encryptionKey) return;
    let cancelled = false;
    const calculate = async () => {
      setLoading(true);
      setError('');
      setFingerprint('');
      try {
        let input;
        if (scope === 'group') {
          const raw = await crypto.subtle.exportKey('raw', encryptionKey);
          input = 'propard-group-v1:' + String(keyVersion) + ':' + Array.from(new Uint8Array(raw), value => value.toString(16).padStart(2, '0')).join('');
        } else {
          if (!friendPublicKey) throw new Error('La clé publique du correspondant est indisponible.');
          const response = await api.get('/api/auth/me', {
            headers: { Authorization: 'Bearer ' + token }
          });
          const own = canonicalKey(response.data?.publicKey);
          const friend = canonicalKey(friendPublicKey);
          input = 'propard-private-v1:' + [own, friend].sort().join('|');
        }
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        if (!cancelled) setFingerprint(formatFingerprint(digest));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Impossible de calculer l’empreinte.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    calculate();
    return () => {
      cancelled = true;
    };
  }, [open, scope, token, encryptionKey, friendPublicKey, keyVersion]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!encryptionKey || (scope === 'private' && !friendPublicKey)}
        title="Vérifier l’identité de chiffrement de cette conversation"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 10px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 12,
          cursor: encryptionKey ? 'pointer' : 'not-allowed',
          opacity: encryptionKey ? 1 : 0.55,
          whiteSpace: 'nowrap'
        }}
      >
        Vérifier E2EE
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vérification E2EE"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.72)' }}
        >
          <section
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(560px, 100%)', padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Vérification du chiffrement</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              Compare cette empreinte avec celle affichée sur l’appareil de ton correspondant, ou avec celle d’un autre membre du groupe. Si elles diffèrent, ne considère pas l’identité E2EE comme vérifiée.
            </p>
            {loading && <p>Calcul de l’empreinte…</p>}
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
            {fingerprint && (
              <div style={{ padding: 14, borderRadius: 9, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 16, lineHeight: 1.8, overflowWrap: 'anywhere', userSelect: 'all' }}>
                {fingerprint}
              </div>
            )}
            {scope === 'group' && <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Version de clé du groupe : {keyVersion}</p>}
            <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Fermer
            </button>
          </section>
        </div>
      )}
    </>
  );
}
