import { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getStoredPrivateKeyJwkForRecovery, publicKeyFromPrivateJwk, validatePrivateKeyMatchesPublicKey, encryptPrivateKeyBackup } from '../utils/crypto';

export default function SettingsPage() {
  const { token, user } = useAuth();
  const [section, setSection] = useState('main');
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryCodesAvailable, setRecoveryCodesAvailable] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const loadPasskeys = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/auth/passkeys', { headers });
      setPasskeys(response.data.passkeys || []);
      setRecoveryCodesAvailable(response.data.recoveryCodesAvailable === true);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les clés d’accès.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'a2f') loadPasskeys();
  }, [section]);

  const goBack = () => {
    if (section === 'a2f') {
      setSection('security');
      return;
    }
    if (section === 'security') {
      setSection('main');
      return;
    }
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const addPasskey = async () => {
    const password = window.prompt('Confirme ton mot de passe Propard pour créer une clé d’accès.');
    if (!password) return;
    const name = window.prompt('Donne un nom à cette clé (ex. iPhone, ordinateur).', 'Ma clé d’accès');
    if (name === null) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const optionsResponse = await api.post('/api/auth/passkeys/register/options', {
        password,
        name
      }, { headers });
      const credential = await startRegistration({
        optionsJSON: optionsResponse.data.options
      });
      const result = await api.post('/api/auth/passkeys/register/verify', {
        response: credential,
        name
      }, { headers });
      setPasskeys(result.data.passkeys || []);
      setRecoveryCodes(result.data.recoveryCodes || []);
      setRecoveryCodesAvailable((result.data.recoveryCodes || []).length > 0 || recoveryCodesAvailable);
      setNotice('Ta clé d’accès est enregistrée.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'La création de la clé a échoué.');
    } finally {
      setLoading(false);
    }
  };

  const renamePasskey = async passkey => {
    const name = window.prompt('Nouveau nom de cette clé :', passkey.name);
    if (!name || !name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.patch(`/api/auth/passkeys/${encodeURIComponent(passkey.id)}`, {
        name: name.trim()
      }, { headers });
      setPasskeys(result.data.passkeys || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de renommer cette clé.');
    } finally {
      setLoading(false);
    }
  };

  const deletePasskey = async passkey => {
    const confirmation = passkeys.length === 1
      ? `Supprimer « ${passkey.name} » désactivera l’authentification par clé d’accès sur ce compte. Continuer ?`
      : `Supprimer la clé « ${passkey.name} » ?`;
    if (!window.confirm(confirmation)) return;
    const password = window.prompt('Confirme ton mot de passe Propard pour supprimer cette clé.');
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.delete(`/api/auth/passkeys/${encodeURIComponent(passkey.id)}`, {
        headers,
        data: { password }
      });
      setPasskeys(result.data.passkeys || []);
      if ((result.data.passkeys || []).length === 0) setRecoveryCodesAvailable(false);
      setNotice('La clé d’accès a été supprimée.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer cette clé.');
    } finally {
      setLoading(false);
    }
  };

  const regenerateRecoveryCodes = async () => {
    const password = window.prompt('Confirme ton mot de passe pour remplacer tes codes de récupération.');
    if (!password) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post('/api/auth/passkeys/recovery/regenerate', { password }, { headers });
      setRecoveryCodes(result.data.recoveryCodes || []);
      setRecoveryCodesAvailable(true);
      setNotice('Tes anciens codes ne fonctionnent plus. Conserve les nouveaux codes en lieu sûr.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de régénérer les codes.');
    } finally {
      setLoading(false);
    }
  };


  const recoverE2EEBackup = async () => {
    const password = window.prompt('Saisis le mot de passe actuel du compte pour recréer la sauvegarde E2EE chiffrée.');
    if (!password) return;

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const currentBackup = await api.get('/api/auth/keybackup', { headers });
      if (currentBackup.data?.backup) {
        setNotice('Une sauvegarde E2EE existe déjà. Aucune modification n’a été effectuée.');
        return;
      }

      const userId = user?.id || user?._id;
      if (!userId) throw new Error('Impossible d’identifier le compte connecté.');

      const privateKeyJwk = await getStoredPrivateKeyJwkForRecovery(userId);
      const publicKeyJwk = publicKeyFromPrivateJwk(privateKeyJwk);
      let serverPublicKey = user?.publicKey || null;

      if (typeof serverPublicKey === 'string') {
        try {
          serverPublicKey = JSON.parse(serverPublicKey);
        } catch {
          throw new Error('La clé publique du compte est illisible. Aucune modification effectuée.');
        }
      }

      if (serverPublicKey) {
        await validatePrivateKeyMatchesPublicKey(privateKeyJwk, serverPublicKey);
      }

      const backup = await encryptPrivateKeyBackup(privateKeyJwk, password);
      await api.post('/api/auth/keybackup', {
        backup,
        password,
        publicKey: JSON.stringify(publicKeyJwk)
      }, { headers });

      setNotice('Sauvegarde E2EE recréée avec succès. La clé privée n’a pas été envoyée en clair.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'La récupération E2EE a échoué.');
    } finally {
      setLoading(false);
    }
  };

  const heading = section === 'main'
    ? 'Paramètres'
    : section === 'security'
      ? 'Sécurité'
      : section === 'e2ee'
        ? 'Récupération E2EE'
        : 'Authentification à deux facteurs';

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <button type="button" style={styles.back} onClick={goBack}>
          ‹ Retour
        </button>
        <h1 style={styles.title}>{heading}</h1>
        {section === 'main' && (
          <button type="button" style={styles.row} onClick={() => setSection('security')}>
            <span style={styles.icon}>♙</span>
            <span style={styles.rowContent}>
              <strong>Sécurité et A2F</strong>
              <small>Gérer les méthodes de protection du compte</small>
            </span>
            <span style={styles.arrow}>›</span>
          </button>
        )}
        {section === 'security' && (
          <>
            <button type="button" style={styles.row} onClick={() => setSection('a2f')}>
              <span style={styles.icon}>⌑</span>
              <span style={styles.rowContent}>
                <strong>A2F</strong>
                <small>Authentification à deux facteurs</small>
              </span>
              <span style={styles.arrow}>›</span>
            </button>
            <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('e2ee')}>
              <span style={styles.icon}>♧</span>
              <span style={styles.rowContent}>
                <strong>Récupération de la clé E2EE</strong>
                <small>Restaurer la sauvegarde depuis la clé privée de cet appareil</small>
              </span>
              <span style={styles.arrow}>›</span>
            </button>
          </>
        )}
        {section === 'e2ee' && (
          <div style={styles.card}>
            <strong>Récupérer ma clé E2EE</strong>
            <p style={styles.description}>Cette opération cherche la clé privée déjà présente sur cet appareil, la vérifie puis recrée une sauvegarde chiffrée avec ton mot de passe. Elle ne génère aucune nouvelle identité et ne remplace jamais une sauvegarde serveur existante.</p>
            {error && <p role="alert" style={styles.error}>{error}</p>}
            {notice && <p role="status" style={styles.success}>{notice}</p>}
            <button type="button" style={styles.primary} onClick={recoverE2EEBackup} disabled={loading}>
              {loading ? 'Vérification et récupération…' : 'Récupérer ma clé E2EE'}
            </button>
            <p style={styles.notice}>Ne ferme pas la page pendant l’opération. Si la clé locale ou sa clé de déchiffrement manque, Propard affichera un diagnostic sans effacer les données existantes.</p>
          </div>
        )}
        {section === 'a2f' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <strong>Clé de sécurité</strong>
                <p style={styles.description}>Les clés d’accès utilisent WebAuthn et sont protégées par ton appareil, ta clé physique ou ton gestionnaire de mots de passe.</p>
              </div>
              <span style={styles.keyIcon}>⌑</span>
            </div>

            {error && <p role="alert" style={styles.error}>{error}</p>}
            {notice && <p role="status" style={styles.success}>{notice}</p>}

            {loading && <p style={styles.description}>Chargement…</p>}

            {!loading && passkeys.length === 0 && (
              <div style={styles.empty}>
                <strong>Aucune clé enregistrée</strong>
                <p>Ajoute une clé d’accès pour demander une vérification supplémentaire à chaque connexion par mot de passe.</p>
              </div>
            )}

            {passkeys.map(passkey => (
              <div key={passkey.id} style={styles.passkey}>
                <div style={styles.passkeyInfo}>
                  <strong>{passkey.name}</strong>
                  <small>Ajoutée le {new Date(passkey.createdAt).toLocaleDateString('fr-FR')}</small>
                  <small>{passkey.deviceType === 'multiDevice' ? 'Synchronisable' : passkey.deviceType === 'singleDevice' ? 'Liée à un appareil' : 'Type d’appareil inconnu'}</small>
                </div>
                <div style={styles.actions}>
                  <button type="button" style={styles.secondary} onClick={() => renamePasskey(passkey)} disabled={loading}>Renommer</button>
                  <button type="button" style={styles.danger} onClick={() => deletePasskey(passkey)} disabled={loading}>Supprimer</button>
                </div>
              </div>
            ))}

            <button type="button" style={styles.primary} onClick={addPasskey} disabled={loading}>
              {loading ? 'Patiente…' : 'Nouveau'}
            </button>

            {recoveryCodesAvailable && recoveryCodes.length === 0 && (
              <button type="button" style={styles.secondary} onClick={regenerateRecoveryCodes} disabled={loading}>
                Régénérer les codes de récupération
              </button>
            )}

            {recoveryCodes.length > 0 && (
              <div style={styles.recovery}>
                <strong>Codes de récupération</strong>
                <p>Conserve ces codes dans un endroit sûr. Chaque code ne peut être utilisé qu’une seule fois. Ils ne seront plus affichés après avoir quitté cette page.</p>
                <pre style={styles.codes}>{recoveryCodes.join('\n')}</pre>
                <button type="button" style={styles.secondary} onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}>Copier les codes</button>
              </div>
            )}

            <p style={styles.notice}>La clé privée reste sur ton appareil ou dans ton gestionnaire de clés. Propard ne stocke que les données publiques nécessaires à la vérification.</p>
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    boxSizing: 'border-box',
    padding: '24px 16px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  panel: {
    width: '100%',
    maxWidth: '620px',
    padding: '20px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-secondary)'
  },
  back: {
    border: 0,
    background: 'transparent',
    color: 'var(--text-secondary)',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: '14px'
  },
  title: {
    margin: '18px 0 22px',
    fontSize: '24px',
    color: 'var(--text-primary)'
  },
  row: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    cursor: 'pointer'
  },
  icon: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    display: 'grid',
    placeItems: 'center',
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    fontSize: '22px'
  },
  rowContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  arrow: {
    fontSize: '24px',
    color: 'var(--text-muted)'
  },
  card: {
    padding: '18px',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    background: 'var(--bg-tertiary)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px'
  },
  description: {
    margin: '6px 0 0',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    lineHeight: 1.5
  },
  keyIcon: {
    width: '42px',
    height: '42px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '12px',
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    fontSize: '24px'
  },
  empty: {
    margin: '22px 0 16px',
    padding: '20px 12px',
    border: '1px dashed var(--border)',
    borderRadius: '10px',
    textAlign: 'center',
    color: 'var(--text-secondary)'
  },
  passkey: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '14px',
    padding: '14px',
    border: '1px solid var(--border)',
    borderRadius: '10px'
  },
  passkeyInfo: {
    display: 'grid',
    gap: '5px',
    minWidth: 0
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  primary: {
    width: '100%',
    border: 0,
    borderRadius: '9px',
    padding: '12px 16px',
    marginTop: '16px',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer'
  },
  secondary: {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 11px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer'
  },
  danger: {
    border: '1px solid var(--danger)',
    borderRadius: '8px',
    padding: '8px 11px',
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer'
  },
  recovery: {
    marginTop: '18px',
    padding: '14px',
    border: '1px solid var(--border)',
    borderRadius: '10px'
  },
  codes: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    padding: '12px',
    borderRadius: '8px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  },
  error: {
    color: 'var(--danger)',
    fontSize: '13px'
  },
  success: {
    color: 'var(--success)',
    fontSize: '13px'
  },
  notice: {
    margin: '12px 0 0',
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: 1.5
  }
};
