import { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { findStoredPrivateKeyForRecovery, publicKeyFromPrivateJwk, encryptPrivateKeyBackup } from '../utils/crypto';
import PersonalVault from '../components/PersonalVault';

export default function SettingsPage() {
  const { token, user } = useAuth();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const [section, setSection] = useState('main');
  const [passkeys, setPasskeys] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [readReceiptsLoading, setReadReceiptsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryCodesAvailable, setRecoveryCodesAvailable] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderDueAt, setReminderDueAt] = useState('');
  const [remindersLoading, setRemindersLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (section !== 'reminders' || !token) return;
    let cancelled = false;
    setRemindersLoading(true);
    api.get('/api/reminders', { headers })
      .then(response => {
        if (!cancelled) setReminders(response.data?.reminders || []);
      })
      .catch(error => {
        if (!cancelled) setError(error.response?.data?.error || 'Impossible de charger les rappels.');
      })
      .finally(() => {
        if (!cancelled) setRemindersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, token]);

  useEffect(() => {
    if (!token) return;
    api.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => setReadReceiptsEnabled(response.data.readReceiptsEnabled !== false))
      .catch(error => console.error('Impossible de charger les préférences de lecture:', error));
  }, [token]);

  const updateReadReceipts = async enabled => {
    setReadReceiptsLoading(true);
    setError('');
    try {
      await api.patch('/api/auth/me', { readReceiptsEnabled: enabled }, { headers });
      setReadReceiptsEnabled(enabled);
    } catch (error) {
      setError(error.response?.data?.error || 'Impossible de modifier cette préférence.');
    } finally {
      setReadReceiptsLoading(false);
    }
  };

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

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/auth/sessions', { headers });
      setSessions(response.data.sessions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les sessions.');
    } finally {
      setLoading(false);
    }
  };

  const loadSecurityEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/auth/security-events', { headers });
      setSecurityEvents(response.data.events || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger l’historique de sécurité.');
    } finally {
      setLoading(false);
    }
  };

  const revokeAllSessions = async () => {
    if (!window.confirm('Déconnecter tous les appareils, y compris celui-ci ? Tu devras te reconnecter.')) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/logout-all', {}, { headers });
      localStorage.removeItem('propard_token');
      localStorage.removeItem('propard_user');
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de déconnecter tous les appareils.');
      setLoading(false);
    }
  };

  const revokeSession = async session => {
    if (!window.confirm(session.current
      ? 'Révoquer cette session déconnectera cet appareil. Continuer ?'
      : 'Déconnecter cet appareil ?')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/auth/sessions/${encodeURIComponent(session.jti)}`, { headers });
      setSessions(previous => previous.filter(item => item.jti !== session.jti));
      if (session.current) {
        localStorage.removeItem('propard_token');
        localStorage.removeItem('propard_user');
        window.location.href = '/';
        return;
      }
      setNotice('La session a été révoquée.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de révoquer cette session.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'a2f') loadPasskeys();
    if (section === 'sessions') loadSessions();
    if (section === 'security-history') loadSecurityEvents();
  }, [section]);

  const goBack = () => {
    if (section === 'e2ee') {
      setSection('security');
      return;
    }
    if (section === 'a2f' || section === 'sessions' || section === 'security-history') {
      setSection('security');
      return;
    }
    if (section === 'security' || section === 'appearance') {
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

      let serverPublicKey = user?.publicKey || null;

      if (typeof serverPublicKey === 'string') {
        try {
          serverPublicKey = JSON.parse(serverPublicKey);
        } catch {
          throw new Error('La clé publique du compte est illisible. Aucune modification effectuée.');
        }
      }

      if (!serverPublicKey) {
        throw new Error('La clé publique E2EE du compte est absente. Impossible d’identifier la bonne clé privée sans risque.');
      }

      const privateKeyJwk = await findStoredPrivateKeyForRecovery(serverPublicKey);
      const publicKeyJwk = publicKeyFromPrivateJwk(privateKeyJwk);
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

  const createReminder = async () => {
    if (!reminderTitle.trim() || !reminderDueAt) {
      setError('Ajoute un titre et une date pour le rappel.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/api/reminders', {
        title: reminderTitle.trim(),
        note: reminderNote.trim() || null,
        dueAt: new Date(reminderDueAt).toISOString()
      }, { headers });
      setReminders(current => [...current, response.data.reminder].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)));
      setReminderTitle('');
      setReminderNote('');
      setReminderDueAt('');
      setNotice('Rappel créé. Il sera envoyé par notification à la date choisie.');
    } catch (error) {
      setError(error.response?.data?.error || 'Impossible de créer le rappel.');
    } finally {
      setLoading(false);
    }
  };

  const cancelReminder = async reminder => {
    setLoading(true);
    setError('');
    try {
      await api.patch('/api/reminders/' + reminder._id + '/cancel', {}, { headers });
      setReminders(current => current.filter(item => item._id !== reminder._id));
    } catch (error) {
      setError(error.response?.data?.error || 'Impossible d’annuler le rappel.');
    } finally {
      setLoading(false);
    }
  };

  const deleteReminder = async reminder => {
    setLoading(true);
    setError('');
    try {
      await api.delete('/api/reminders/' + reminder._id, { headers });
      setReminders(current => current.filter(item => item._id !== reminder._id));
    } catch (error) {
      setError(error.response?.data?.error || 'Impossible de supprimer le rappel.');
    } finally {
      setLoading(false);
    }
  };

  const heading = section === 'main'
    ? 'Paramètres'
    : section === 'appearance'
      ? 'Personnalisation'
      : section === 'reminders'
        ? 'Rappels'
       : section === 'sessions'
        ? 'Appareils connectés'
        : section === 'security-history'
        ? 'Historique de sécurité'
      : section === 'security'
      ? 'Sécurité'
      : section === 'e2ee'
        ? 'Récupération E2EE'
        : section === 'vault'
          ? 'Coffre-fort E2EE'
          : 'Authentification à deux facteurs';

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <button type="button" style={styles.back} onClick={goBack}>
          ‹ Retour
        </button>
        <h1 style={styles.title}>{heading}</h1>
        {section === 'main' && (
          <>
          <button type="button" style={styles.row} onClick={() => setSection('appearance')}>
            <span style={styles.icon}>◉</span>
            <span style={styles.rowContent}>
              <strong>Personnalisation</strong>
              <small>Choisir le thème et la couleur de Propard</small>
            </span>
            <span style={styles.arrow}>›</span>
          </button>
          <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('reminders')}>
            <span style={styles.icon}>◷</span>
            <span style={styles.rowContent}>
              <strong>Rappels</strong>
              <small>Recevoir une notification à une date précise</small>
            </span>
            <span style={styles.arrow}>›</span>
          </button>
          <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('security')}>
            <span style={styles.icon}>♙</span>
            <span style={styles.rowContent}>
              <strong>Sécurité et A2F</strong>
              <small>Gérer les méthodes de protection du compte</small>
            </span>
            <span style={styles.arrow}>›</span>
          </button>
          </>
        )}
        {section === 'reminders' && (
          <div style={styles.card}>
            <strong>Créer un rappel</strong>
            <p style={styles.description}>Les rappels sont personnels. Ils sont envoyés par notification push, si les notifications sont activées sur ton appareil.</p>
            <input style={{ ...styles.input, marginTop: 14 }} value={reminderTitle} maxLength={80} placeholder="Titre du rappel" onChange={event => setReminderTitle(event.target.value)} />
            <textarea style={{ ...styles.input, marginTop: 10, minHeight: 76, resize: 'vertical' }} value={reminderNote} maxLength={240} placeholder="Note facultative" onChange={event => setReminderNote(event.target.value)} />
            <label style={{ display: 'block', marginTop: 12, marginBottom: 6, color: 'var(--text-secondary)', fontSize: 13 }}>Date et heure</label>
            <input style={styles.input} type="datetime-local" value={reminderDueAt} onChange={event => setReminderDueAt(event.target.value)} />
            <button type="button" style={styles.primary} onClick={createReminder} disabled={loading}>Créer le rappel</button>
            <div style={{ marginTop: 22 }}>
              <strong>Rappels à venir</strong>
              {remindersLoading ? <p style={styles.description}>Chargement…</p> : reminders.filter(item => item.status === 'pending' || item.status === 'processing').length === 0 ? (
                <p style={styles.empty}>Aucun rappel en attente.</p>
              ) : reminders.filter(item => item.status === 'pending' || item.status === 'processing').map(reminder => (
                <div key={reminder._id} style={styles.passkey}>
                  <div style={styles.passkeyInfo}>
                    <strong>{reminder.title}</strong>
                    {reminder.note && <small>{reminder.note}</small>}
                    <small>{new Date(reminder.dueAt).toLocaleString()}</small>
                  </div>
                  <button type="button" style={styles.danger} onClick={() => cancelReminder(reminder)} disabled={loading}>Annuler</button>
                </div>
              ))}
              <strong style={{ display: 'block', marginTop: 18 }}>Déjà envoyés</strong>
              {reminders.filter(item => item.status === 'sent').map(reminder => (
                <div key={reminder._id} style={styles.passkey}>
                  <div style={styles.passkeyInfo}>
                    <strong>{reminder.title}</strong>
                    <small>{new Date(reminder.sentAt || reminder.dueAt).toLocaleString()}</small>
                  </div>
                  <button type="button" style={styles.secondary} onClick={() => deleteReminder(reminder)} disabled={loading}>Supprimer</button>
                </div>
              ))}
              {reminders.filter(item => item.status === 'failed').map(reminder => (
                <div key={reminder._id} style={styles.passkey}>
                  <div style={styles.passkeyInfo}>
                    <strong>{reminder.title}</strong>
                    <small style={{ color: 'var(--danger)' }}>Échec de livraison après plusieurs tentatives</small>
                  </div>
                  <button type="button" style={styles.secondary} onClick={() => deleteReminder(reminder)} disabled={loading}>Supprimer</button>
                </div>
              ))}
            </div>
            {error && <p style={styles.error}>{error}</p>}
            {notice && <p style={styles.success}>{notice}</p>}
          </div>
        )}
        {section === 'appearance' && (
          <div style={styles.card}>
            <strong>Mode d’affichage</strong>
            <p style={styles.description}>Choisis entre le thème sombre et le thème clair. Le réglage est conservé sur cet appareil.</p>
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: 600
              }}
            >
              {theme === 'dark' ? '☾ Thème sombre activé · Passer au thème clair' : '☀ Thème clair activé · Passer au thème sombre'}
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '22px 0' }} />
            <strong>Couleur d’accent</strong>
            <p style={styles.description}>Cette couleur est appliquée aux boutons, aux liens et aux éléments importants. Le choix est enregistré sur cet appareil.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 10, marginTop: 18 }}>
              {[
                ['blue', 'Bleu', '#5b8af0'],
                ['purple', 'Violet', '#9b72f2'],
                ['green', 'Vert', '#38b879'],
                ['pink', 'Rose', '#e46ca8'],
                ['orange', 'Orange', '#e58a42']
              ].map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAccent(value)}
                  aria-pressed={accent === value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px',
                    borderRadius: 9,
                    border: accent === value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: 99, background: color, flexShrink: 0 }} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {section === 'security' && (
          <>
            <button type="button" style={styles.row} onClick={() => setSection('sessions')}>
              <span style={styles.icon}>▣</span>
              <span style={styles.rowContent}>
                <strong>Appareils connectés</strong>
                <small>Consulter et déconnecter les sessions de ton compte</small>
              </span>
              <span style={styles.arrow}>›</span>
            </button>
            <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('security-history')}>
              <span style={styles.icon}>◷</span>
              <span style={styles.rowContent}>
                <strong>Historique de sécurité</strong>
                <small>Voir les 50 dernières connexions à ton compte</small>
              </span>
              <span style={styles.arrow}>›</span>
            </button>
            <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('a2f')}>
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
            <button type="button" style={{ ...styles.row, marginTop: '12px' }} onClick={() => setSection('vault')}>
              <span style={styles.icon}>▣</span>
              <span style={styles.rowContent}>
                <strong>Coffre-fort personnel E2EE</strong>
                <small>Protéger tes notes avec une phrase secrète</small>
              </span>
              <span style={styles.arrow}>›</span>
            </button>
            <div style={{ ...styles.card, marginTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={readReceiptsEnabled}
                  disabled={readReceiptsLoading}
                  onChange={event => updateReadReceipts(event.target.checked)}
                />
                Envoyer les confirmations de lecture
              </label>
              <p style={styles.description}>Si tu désactives cette option, les autres ne verront plus quand tu as lu leurs messages privés. Tu continueras à voir les confirmations des autres.</p>
            </div>
            {error && <p role="alert" style={styles.error}>{error}</p>}
          </>
        )}
        {section === 'sessions' && (
          <div style={styles.card}>
            <strong>Sessions de ton compte</strong>
            <p style={styles.description}>Les connexions récentes sont conservées avec leur navigateur et leur date de connexion. Tu peux révoquer chaque session séparément.</p>
            {error && <p role="alert" style={styles.error}>{error}</p>}
            {notice && <p role="status" style={styles.success}>{notice}</p>}
            {loading && <p style={styles.description}>Chargement…</p>}
            {!loading && sessions.length === 0 && (
              <div style={styles.empty}>
                <strong>Aucune session enregistrée</strong>
                <p>Les nouvelles connexions apparaîtront ici.</p>
              </div>
            )}
            {sessions.map(session => (
              <div key={session.jti} style={styles.passkey}>
                <div style={styles.passkeyInfo}>
                  <strong>{session.current ? 'Cet appareil' : 'Autre appareil'}</strong>
                  <small>{session.userAgent || 'Navigateur inconnu'}</small>
                  <small>Connecté le {new Date(session.createdAt).toLocaleString('fr-FR')}</small>
                  <small>Expire le {new Date(session.expiresAt).toLocaleString('fr-FR')}</small>
                </div>
                <div style={styles.actions}>
                  <button type="button" style={styles.danger} onClick={() => revokeSession(session)} disabled={loading}>
                    {session.current ? 'Déconnecter cet appareil' : 'Révoquer'}
                  </button>
                </div>
              </div>
            ))}
            <button type="button" style={styles.secondary} onClick={loadSessions} disabled={loading}>Actualiser</button>
            <button type="button" style={{ ...styles.danger, width: '100%', marginTop: 12 }} onClick={revokeAllSessions} disabled={loading}>
              Déconnecter tous les appareils
            </button>
          </div>
        )}
        {section === 'security-history' && (
          <div style={styles.card}>
            <strong>Connexions récentes</strong>
            <p style={styles.description}>Historique limité aux 50 derniers événements. Seules la date, la méthode de connexion et les informations du navigateur sont conservées. Aucune adresse IP n’est enregistrée dans cet historique.</p>
            {error && <p role="alert" style={styles.error}>{error}</p>}
            {loading && <p style={styles.description}>Chargement…</p>}
            {!loading && securityEvents.length === 0 && (
              <div style={styles.empty}>
                <strong>Aucun événement enregistré</strong>
                <p>Les prochaines connexions apparaîtront ici.</p>
              </div>
            )}
            {securityEvents.map((event, index) => (
              <div key={event.createdAt + '-' + index} style={styles.passkey}>
                <div style={styles.passkeyInfo}>
                  <strong>{event.eventType === 'registration' ? 'Création du compte' : event.eventType === 'passkey_login' ? 'Connexion avec une clé d’accès' : event.eventType === 'recovery_code_login' ? 'Connexion avec un code de récupération' : 'Connexion avec mot de passe'}</strong>
                  <small>{new Date(event.createdAt).toLocaleString('fr-FR')}</small>
                  <small>{event.userAgent || 'Navigateur inconnu'}</small>
                </div>
              </div>
            ))}
            <button type="button" style={styles.secondary} onClick={loadSecurityEvents} disabled={loading}>Actualiser</button>
          </div>
        )}
        {section === 'vault' && (
          <div style={styles.card}>
            <PersonalVault token={token} />
          </div>
        )}
        {section === 'e2ee' && (
          <div style={styles.card}>
            <strong>Récupérer ma clé E2EE</strong>
            <p style={styles.description}>Cette opération examine les entrées IndexedDB et localStorage du site, cherche une clé privée correspondant exactement à la clé publique du compte, puis recrée une sauvegarde chiffrée. Elle ne génère aucune nouvelle identité et ne modifie aucune donnée locale pendant le diagnostic.</p>
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
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '11px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    font: 'inherit'
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
