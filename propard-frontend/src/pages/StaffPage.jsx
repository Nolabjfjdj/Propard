import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { enablePushNotifications, disablePushNotifications, isPushEnabled } from '../utils/pushNotifications';

const roles = [
  ['user', 'Utilisateur'],
  ['support', 'Support'],
  ['junior_moderator', 'Modérateur junior'],
  ['moderator', 'Modérateur'],
  ['senior_moderator', 'Modérateur senior'],
  ['admin', 'Administrateur'],
  ['owner', 'Propriétaire']
];

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  marginTop: 6
};

const buttonStyle = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--accent)',
  color: '#fff',
  cursor: 'pointer',
  marginTop: 8,
  fontWeight: 600,
  transition: 'background 0.2s ease, transform 0.2s ease'
};

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, color: 'var(--text-primary)' }}>
      {label}
      <input
        style={inputStyle}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function Panel({ title, children }) {
  return (
    <section style={{
      padding: 18,
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--bg-secondary)',
      minWidth: 0
    }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function StaffPage() {
  const [staffRole, setStaffRole] = useState('');
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bootstrapKey, setBootstrapKey] = useState('');
  const [lookupUsername, setLookupUsername] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('new');
  const [targetUserId, setTargetUserId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('24h');
  const [resetUserId, setResetUserId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [roleUserId, setRoleUserId] = useState('');
  const [newRole, setNewRole] = useState('support');
  const [auditLogs, setAuditLogs] = useState([]);
  const [accountHelpRequests, setAccountHelpRequests] = useState([]);
  const [helpReplyDrafts, setHelpReplyDrafts] = useState({});
  const [helpReplySaving, setHelpReplySaving] = useState('');
  const [helpNotifications, setHelpNotifications] = useState({ passwordReset: true, support: true });
  const [helpRequestsLoading, setHelpRequestsLoading] = useState(false);
  const [helpSettingsSaving, setHelpSettingsSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSettingsLoading, setPushSettingsLoading] = useState(false);
  const knownHelpRequestIds = useRef(null);

  const request = useCallback(async (method, path, data) => {
    const token = localStorage.getItem('propard_token');
    if (!token) throw new Error('Connecte-toi à Propard pour accéder au personnel.');
    const config = { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' } };
    if (method === 'get') return api.get(path, config);
    if (method === 'patch') return api.patch(path, data, config);
    return api.post(path, data, config);
  }, []);

  const loadAccountHelpRequests = useCallback(async ({ notify = false } = {}) => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    if (!notify) setHelpRequestsLoading(true);
    try {
      const response = await request('get', '/api/staff/account-help/requests');
      const incoming = response.data.requests || [];
      const preferences = response.data.notifications || { passwordReset: true, support: true };
      if (notify && knownHelpRequestIds.current) {
        const fresh = incoming.filter(item =>
          !knownHelpRequestIds.current.has(item._id) &&
          item.status === 'new' &&
          (item.kind === 'password_reset' ? preferences.passwordReset : preferences.support)
        );
        if (fresh.length && typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
          new window.Notification('Nouvelle demande Propard', {
            body: fresh.length === 1
              ? `${fresh[0].kind === 'password_reset' ? 'Récupération de compte' : 'Support'} · @${fresh[0].username}`
              : `${fresh.length} nouvelles demandes reçues.`
          });
        }
      }
      knownHelpRequestIds.current = new Set(incoming.map(item => item._id));
      setAccountHelpRequests(incoming);
      setHelpNotifications(preferences);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les demandes de support.');
    } finally {
      if (!notify) setHelpRequestsLoading(false);
    }
  }, [request, staffRole]);

  const updateHelpRequestStatus = async (requestId, status) => {
    setError('');
    try {
      const response = await request('patch', `/api/staff/account-help/requests/${requestId}`, { status });
      setAccountHelpRequests(previous => previous.map(item => item._id === requestId ? response.data.request : item));
      setNotice('Statut de la demande mis à jour.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de modifier la demande.');
    }
  };

  const sendHelpReply = async requestId => {
    const staffReply = (helpReplyDrafts[requestId] || '').trim();
    if (!staffReply) {
      setError('Écris une réponse avant de l’envoyer.');
      return;
    }
    setError('');
    setHelpReplySaving(requestId);
    try {
      const response = await request('patch', `/api/staff/account-help/requests/${requestId}`, { staffReply });
      setAccountHelpRequests(previous => previous.map(item => item._id === requestId ? response.data.request : item));
      setHelpReplyDrafts(previous => ({ ...previous, [requestId]: '' }));
      setNotice('Réponse enregistrée. Le demandeur peut la consulter avec sa référence et sa clé de suivi.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’envoyer la réponse.');
    } finally {
      setHelpReplySaving('');
    }
  };

  const issueRequestRecoveryCode = async requestId => {
    setError('');
    try {
      const response = await request('post', `/api/staff/account-help/requests/${requestId}/recovery-code`, {});
      setNotice(response.data.message || 'Code de récupération créé.');
      await loadAccountHelpRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de créer le code de récupération.');
    }
  };

  const configurePushNotifications = async (enable) => {
    setPushSettingsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('propard_token');
      if (!token) throw new Error('Connecte-toi à Propard pour configurer les notifications.');
      if (enable) {
        await enablePushNotifications(token);
        setPushEnabled(true);
        setNotice('Notifications push activées sur cet appareil. Les demandes pourront arriver même lorsque Propard est fermé.');
      } else {
        await disablePushNotifications(token);
        setPushEnabled(false);
        setNotice('Notifications push désactivées sur cet appareil.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Impossible de configurer les notifications push.');
    } finally {
      setPushSettingsLoading(false);
    }
  };

  const saveHelpNotifications = async (nextSettings) => {
    setHelpSettingsSaving(true);
    setError('');
    try {
      const response = await request('patch', '/api/staff/account-help/settings', {
        passwordResetNotifications: nextSettings.passwordReset,
        supportNotifications: nextSettings.support
      });
      setHelpNotifications({
        passwordReset: response.data.passwordResetNotifications,
        support: response.data.supportNotifications
      });
      setNotice('Préférences de notification enregistrées.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer les notifications.');
    } finally {
      setHelpSettingsSaving(false);
    }
  };

  const loadRole = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request('get', '/api/staff/me');
      setStaffRole(response.data.staffRole || '');
      setError('');
    } catch (err) {
      if (err.response?.status === 403) {
        setStaffRole('');
        try {
          const status = await request('get', '/api/staff/bootstrap/status');
          setBootstrapAvailable(status.data.available === true);
          setError('');
        } catch (statusError) {
          setBootstrapAvailable(false);
          setError(statusError.response?.data?.error || statusError.message || 'Impossible de vérifier la configuration du personnel.');
        }
      } else {
        setBootstrapAvailable(false);
        setError(err.response?.data?.error || err.message || 'Impossible de charger le rôle.');
      }
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadRole();
  }, [loadRole]);

  useEffect(() => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    let active = true;
    isPushEnabled().then(enabled => {
      if (active) setPushEnabled(enabled);
    }).catch(() => {
      if (active) setPushEnabled(false);
    });
    return () => {
      active = false;
    };
  }, [staffRole]);

  useEffect(() => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    loadAccountHelpRequests();
    const interval = window.setInterval(() => loadAccountHelpRequests({ notify: true }), 5000);
    return () => window.clearInterval(interval);
  }, [staffRole, loadAccountHelpRequests]);

  const lookupUser = async () => {
    setError('');
    setLookupResult(null);
    try {
      const response = await request('get', `/api/staff/users/search?username=${encodeURIComponent(lookupUsername.trim())}`);
      const found = response.data.user;
      setLookupResult(found);
      setTargetUserId(found._id);
      setResetUserId(found._id);
      setRoleUserId(found._id);
      setNotice(`Compte trouvé : ${found.username}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Recherche du compte impossible.');
    }
  };

  const loadReports = async () => {
    setError('');
    try {
      const response = await request('get', '/api/staff/reports');
      setReports(response.data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les signalements.');
    }
  };

  const openReport = async reportId => {
    setError('');
    setSelectedReport(null);
    try {
      const response = await request('get', `/api/staff/reports/${reportId}`);
      setSelectedReport(response.data.report);
      setReportStatus(response.data.report.status || 'new');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’ouvrir ce signalement.');
    }
  };

  const updateReport = async status => {
    if (!selectedReport) return;
    setError('');
    try {
      await request('patch', `/api/staff/reports/${selectedReport._id}/status`, { status });
      setSelectedReport(previous => ({ ...previous, status }));
      setReports(previous => previous.map(report => report._id === selectedReport._id ? { ...report, status } : report));
      setNotice('Statut du signalement mis à jour.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de mettre à jour le signalement.');
    }
  };

  const submitBan = async unban => {
    if (!targetUserId.trim()) {
      setError('Indique l’identifiant du compte.');
      return;
    }
    setError('');
    try {
      const path = `/api/staff/users/${encodeURIComponent(targetUserId.trim())}/${unban ? 'unban' : 'ban'}`;
      await request('post', path, unban ? {} : { duration: banDuration, reason: banReason.trim() });
      setNotice(unban ? 'Compte débanni.' : 'Bannissement appliqué.');
      if (!unban) setBanReason('');
    } catch (err) {
      setError(err.response?.data?.error || 'Action de modération impossible.');
    }
  };

  const issueReset = async () => {
    setError('');
    setResetToken('');
    try {
      const response = await request('post', `/api/staff/users/${encodeURIComponent(resetUserId.trim())}/password-reset`, {});
      setResetToken(response.data.resetToken || '');
      setNotice(response.data.warning || 'Code de récupération créé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de créer le code de récupération.');
    }
  };

  const changeRole = async () => {
    setError('');
    try {
      await request('patch', `/api/staff/users/${encodeURIComponent(roleUserId.trim())}/role`, { staffRole: newRole });
      setNotice('Rôle du personnel mis à jour.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de modifier le rôle.');
    }
  };

  const loadAudit = async () => {
    setError('');
    try {
      const response = await request('get', '/api/staff/audit');
      setAuditLogs(response.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger le journal d’audit.');
    }
  };

  const bootstrap = async () => {
    setError('');
    try {
      const response = await request('post', '/api/staff/bootstrap', { bootstrapKey });
      setStaffRole(response.data.staffRole || 'owner');
      setBootstrapKey('');
      setNotice('Le compte propriétaire est configuré.');
    } catch (err) {
      setError(err.response?.data?.error || 'Configuration initiale impossible.');
    }
  };

  if (loading) {
    return <main style={{ padding: 24, color: 'var(--text-primary)' }}>Chargement du panneau de modération…</main>;
  }

  return (
    <main style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '24px 16px 48px',
      color: 'var(--text-primary)',
      background: 'var(--bg-primary)',
      minHeight: '100vh',
      display: 'grid',
      gap: 16
    }}>
      <header>
        <h1 style={{ marginBottom: 6 }}>Propard · Modération</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Permissions côté serveur · accès aux conversations signalées journalisé.
        </p>
        {staffRole && <strong>Rôle actuel : {roles.find(([value]) => value === staffRole)?.[1] || staffRole}</strong>}
      </header>

      {error && <div role="alert" style={{ padding: 12, borderRadius: 8, background: '#5a2020' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)' }}>{notice}</div>}

      {staffRole && (
        <Panel title="Rechercher un compte">
          <p>Recherche exacte par pseudo. Le résultat remplit automatiquement les formulaires de modération ci-dessous.</p>
          <Field label="Pseudo" value={lookupUsername} onChange={setLookupUsername} placeholder="Pseudo Propard" />
          <button style={buttonStyle} onClick={lookupUser}>Rechercher le compte</button>
          {lookupResult && (
            <div style={{ marginTop: 12 }}>
              <strong>{lookupResult.displayName || lookupResult.username}</strong>
              <div>@{lookupResult.username} · ID : <code>{lookupResult._id}</code></div>
              <div>Rôle : {lookupResult.staffRole || 'user'} · {lookupResult.bannedAt ? 'Compte banni' : 'Non banni'}</div>
            </div>
          )}
        </Panel>
      )}

      {!staffRole ? (
        bootstrapAvailable ? (
          <Panel title="Configuration initiale du propriétaire">
            <p>Aucun rôle du personnel n’est encore attribué. Utilise la clé de configuration définie côté serveur pour faire de ce compte le propriétaire initial.</p>
            <Field label="Clé de configuration" value={bootstrapKey} onChange={setBootstrapKey} type="password" />
            <button style={buttonStyle} onClick={bootstrap}>Configurer ce compte comme propriétaire</button>
          </Panel>
        ) : (
          <Panel title="Accès au personnel">
            <p>Ce compte n’a pas de rôle du personnel. La configuration initiale est désactivée car un rôle existe déjà, ou l’état de configuration n’a pas pu être vérifié. Connecte-toi avec le compte propriétaire ou demande à un propriétaire de gérer les rôles.</p>
            <button style={buttonStyle} onClick={loadRole}>Réessayer</button>
          </Panel>
        )
      ) : (
        <>
          <Panel title="Demandes de récupération et support">
            <p>Les demandes envoyées depuis la page de connexion arrivent ici. Aucun e-mail n’est envoyé. Pour les demandes de récupération, lis les explications avant de décider si l’identité du demandeur est suffisamment vérifiée.</p>
            { (
              <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                <strong>Mes notifications</strong>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={helpNotifications.passwordReset} disabled={helpSettingsSaving} onChange={event => saveHelpNotifications({ ...helpNotifications, passwordReset: event.target.checked })} />
                  Demandes « Mot de passe oublié »
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={helpNotifications.support} disabled={helpSettingsSaving} onChange={event => saveHelpNotifications({ ...helpNotifications, support: event.target.checked })} />
                  Demandes de support
                </label>
                <small>Ces préférences sont personnelles : elles ne changent pas celles des autres membres du personnel. Les notifications push peuvent arriver même lorsque le panneau est fermé, si elles sont activées sur cet appareil et configurées côté serveur.</small>
                {pushEnabled ? (
                  <button style={buttonStyle} onClick={() => configurePushNotifications(false)} disabled={pushSettingsLoading}>
                    {pushSettingsLoading ? 'Mise à jour…' : 'Désactiver les notifications push sur cet appareil'}
                  </button>
                ) : (
                  <button style={buttonStyle} onClick={() => configurePushNotifications(true)} disabled={pushSettingsLoading}>
                    {pushSettingsLoading ? 'Activation…' : 'Activer les notifications push sur cet appareil'}
                  </button>
                )}
              </div>
            )}
            <button style={buttonStyle} onClick={() => loadAccountHelpRequests()} disabled={helpRequestsLoading}>
              {helpRequestsLoading ? 'Actualisation…' : 'Actualiser les demandes'}
            </button>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {accountHelpRequests.map(item => (
                <article key={item._id} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{item.kind === 'password_reset' ? '🔐 Mot de passe oublié' : '💬 Support'} · @{item.username}</strong>
                    <span style={{ fontSize: 12 }}>{item.status === 'new' ? 'Nouvelle' : item.status === 'in_progress' ? 'En cours' : 'Résolue'}</span>
                  </div>
                  <small style={{ display: 'block', opacity: 0.75, marginTop: 5 }}>{new Date(item.createdAt).toLocaleString()} · {item.userId ? 'Compte trouvé' : 'Compte non trouvé à la réception'}</small>
                  {item.messages?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, color: 'var(--text-secondary)', fontSize: 12 }}>
                      <span>{item.messages.length} message{item.messages.length > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>Dernier message : {item.messages[item.messages.length - 1].senderType === 'staff' ? 'Personnel' : 'Demandeur'}</span>
                      {item.messages[item.messages.length - 1].senderType === 'user' && <strong style={{ color: 'var(--accent)' }}>Nouveau message du demandeur</strong>}
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
                    {(item.messages && item.messages.length ? item.messages : [{ senderType: 'user', senderName: item.username, text: item.message, createdAt: item.createdAt }]).map((message, index) => (
                      <div key={message._id || index} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: message.senderType === 'staff' ? 'var(--bg-primary, #111)' : 'var(--bg-tertiary)' }}>
                        <small style={{ display: 'block', opacity: 0.75, marginBottom: 5 }}>{message.senderType === 'staff' ? 'Personnel · ' : 'Demandeur · '}{message.senderName || ''}{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ''}</small>
                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</div>
                      </div>
                    ))}
                  </div>
                  <label style={{ display: 'block', marginTop: 10 }}>
                    Réponse visible par le demandeur
                    <textarea
                      style={{ ...inputStyle, minHeight: 85, resize: 'vertical' }}
                      value={helpReplyDrafts[item._id] ?? item.staffReply ?? ''}
                      onChange={event => setHelpReplyDrafts(previous => ({ ...previous, [item._id]: event.target.value }))}
                      maxLength={1500}
                      placeholder="Écris une réponse claire, sans demander le mot de passe."
                    />
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" style={buttonStyle} onClick={() => updateHelpRequestStatus(item._id, 'in_progress')}>Prendre en charge</button>
                    <button type="button" style={buttonStyle} onClick={() => sendHelpReply(item._id)} disabled={helpReplySaving === item._id}>{helpReplySaving === item._id ? 'Envoi…' : 'Envoyer la réponse'}</button>
                    <button type="button" style={buttonStyle} onClick={() => updateHelpRequestStatus(item._id, 'resolved')}>Marquer résolue</button>
                    <button type="button" style={buttonStyle} onClick={() => updateHelpRequestStatus(item._id, 'new')}>Remettre en nouvelle</button>
                    {item.kind === 'password_reset' && item.userId && (
                      <button type="button" style={buttonStyle} onClick={() => issueRequestRecoveryCode(item._id)}>Valider et envoyer un code temporaire</button>
                    )}
                    {item.kind === 'password_reset' && item.userId && (
                      <button type="button" style={buttonStyle} onClick={() => setResetUserId(item.userId._id)}>Ouvrir la récupération manuelle</button>
                    )}
                  </div>
                </article>
              ))}
              {!accountHelpRequests.length && !helpRequestsLoading && <p style={{ color: 'var(--text-secondary)' }}>Aucune demande pour le moment.</p>}
            </div>
          </Panel>

          {['junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole) && (
            <Panel title="Signalements">
              <p>La liste ne charge pas le contenu complet des conversations. Ouvre un signalement pour consulter les détails selon tes permissions.</p>
              <button style={buttonStyle} onClick={loadReports}>Charger les signalements</button>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {reports.map(report => (
                  <button key={report._id} style={{ ...buttonStyle, textAlign: 'left', marginTop: 0 }} onClick={() => openReport(report._id)}>
                    <strong>{report.reportScope === 'conversation' ? 'Conversation' : 'Message'} · {report.status}</strong>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{report.reason || 'Aucun motif fourni'} · {new Date(report.createdAt).toLocaleString()}</div>
                  </button>
                ))}
              </div>
              {selectedReport && (
                <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <h3>Signalement sélectionné</h3>
                  <p>Type : {selectedReport.reportScope || 'message'} · Statut : {selectedReport.status}</p>
                  <p>Signalé par : {selectedReport.reporter?.username || 'Compte indisponible'}</p>
                  <p>Motif : {selectedReport.reason || 'Non précisé'}</p>
                  {selectedReport.reportScope === 'conversation' ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <strong>Conversation fournie avec le signalement</strong>
                      {(selectedReport.conversationSnapshot || []).map((message, index) => (
                        <article key={`${selectedReport._id}-${index}`} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                          <small>{message.senderName || message.senderId} · {message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Date inconnue'}</small>
                          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.content}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedReport.content}</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <button style={buttonStyle} onClick={() => updateReport('processed')}>Marquer traité</button>
                    <button style={buttonStyle} onClick={() => updateReport('rejected')}>Rejeter</button>
                    <button style={buttonStyle} onClick={() => updateReport('new')}>Remettre en nouveau</button>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {['moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole) && (
            <Panel title="Bannissements">
              <Field label="ID du compte" value={targetUserId} onChange={setTargetUserId} placeholder="Identifiant utilisateur" />
              <Field label="Motif obligatoire" value={banReason} onChange={setBanReason} placeholder="Motif de la sanction" />
              <label style={{ display: 'block' }}>Durée
                <select style={inputStyle} value={banDuration} onChange={event => setBanDuration(event.target.value)}>
                  <option value="1h">1 heure</option>
                  <option value="6h">6 heures</option>
                  <option value="24h">24 heures</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                  <option value="permanent">Permanent (senior+)</option>
                </select>
              </label>
              <button style={buttonStyle} onClick={() => submitBan(false)}>Bannir le compte</button>
              <button style={{ ...buttonStyle, marginLeft: 8 }} onClick={() => submitBan(true)}>Débannir l’ID indiqué</button>
            </Panel>
          )}

          {['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole) && (
            <Panel title="Aide à la récupération de compte">
              <p>Le personnel ne choisit pas et ne voit jamais le nouveau mot de passe. Le code est à usage unique et expire après 15 minutes. Remets le code à l’utilisateur et demande-lui d’ouvrir <code>/password-reset</code>. La réinitialisation peut supprimer la sauvegarde E2EE chiffrée avec l’ancien mot de passe.</p>
              <Field label="ID du compte" value={resetUserId} onChange={setResetUserId} placeholder="Identifiant utilisateur" />
              <button style={buttonStyle} onClick={issueReset}>Créer un code temporaire</button>
              {resetToken && (
                <div style={{ marginTop: 12 }}>
                  <strong>Code affiché une seule fois</strong>
                  <code style={{ display: 'block', overflowWrap: 'anywhere', padding: 12, marginTop: 6, background: 'var(--bg-tertiary)' }}>{resetToken}</code>
                  <button style={buttonStyle} onClick={() => navigator.clipboard?.writeText(resetToken)}>Copier le code</button>
                </div>
              )}
            </Panel>
          )}

          {['admin', 'owner'].includes(staffRole) && (
            <Panel title="Gestion du personnel">
              <Field label="ID du compte" value={roleUserId} onChange={setRoleUserId} placeholder="Identifiant utilisateur" />
              <label style={{ display: 'block' }}>Nouveau rôle
                <select style={inputStyle} value={newRole} onChange={event => setNewRole(event.target.value)}>
                  {roles.filter(([value]) => value !== 'owner' || staffRole === 'owner').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button style={buttonStyle} onClick={changeRole}>Modifier le rôle</button>
            </Panel>
          )}

          {['admin', 'owner'].includes(staffRole) && (
            <Panel title="Journal d’audit">
              <button style={buttonStyle} onClick={loadAudit}>Charger les dernières actions</button>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {auditLogs.map(log => (
                  <article key={log._id} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                    <strong>{log.action}</strong>
                    <div>{log.actorUsername || log.actor?.username || log.details?.actorUsername || (log.actorId ? `Compte introuvable (${log.actorId.slice(-6)})` : 'Personnel inconnu')} → {log.targetUsername || log.targetUser?.username || log.details?.username || (log.targetUserId ? `Compte introuvable (${log.targetUserId.slice(-6)})` : 'aucune cible')}</div>
                    <small>{new Date(log.createdAt).toLocaleString()}</small>
                  </article>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
      <a
        href="/"
        style={{
          display: 'block',
          marginTop: 24,
          fontSize: 13,
          color: 'var(--text-secondary)',
          textDecoration: 'none'
        }}
      >
        ← Retour
      </a>
    </main>
  );
}
