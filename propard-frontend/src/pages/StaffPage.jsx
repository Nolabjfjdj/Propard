import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

const roles = [
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
  border: '1px solid var(--border-color, #444)',
  background: 'var(--bg-secondary, #171717)',
  color: 'var(--text-primary, #fff)',
  marginTop: 6
};

const buttonStyle = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--border-color, #555)',
  background: 'var(--bg-secondary, #222)',
  color: 'var(--text-primary, #fff)',
  cursor: 'pointer',
  marginTop: 8
};

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, color: 'var(--text-primary, #fff)' }}>
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
      border: '1px solid var(--border-color, #333)',
      borderRadius: 12,
      background: 'var(--bg-primary, #101010)',
      minWidth: 0
    }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function StaffPage() {
  const [staffRole, setStaffRole] = useState('');
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

  const request = useCallback(async (method, path, data) => {
    const token = localStorage.getItem('propard_token');
    if (!token) throw new Error('Connecte-toi à Propard pour accéder au personnel.');
    const config = { headers: { Authorization: `Bearer ${token}` } };
    if (method === 'get') return api.get(path, config);
    if (method === 'patch') return api.patch(path, data, config);
    return api.post(path, data, config);
  }, []);

  const loadRole = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request('get', '/api/staff/me');
      setStaffRole(response.data.staffRole || '');
      setError('');
    } catch (err) {
      if (err.response?.status === 403) {
        setStaffRole('');
        setError('');
      } else {
        setError(err.response?.data?.error || err.message || 'Impossible de charger le rôle.');
      }
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadRole();
  }, [loadRole]);

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
    return <main style={{ padding: 24, color: 'var(--text-primary, #fff)' }}>Chargement du panneau de modération…</main>;
  }

  return (
    <main style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '24px 16px 48px',
      color: 'var(--text-primary, #fff)',
      display: 'grid',
      gap: 16
    }}>
      <header>
        <h1 style={{ marginBottom: 6 }}>Propard · Modération</h1>
        <p style={{ color: 'var(--text-secondary, #aaa)', marginTop: 0 }}>
          Permissions côté serveur · accès aux conversations signalées journalisé.
        </p>
        {staffRole && <strong>Rôle actuel : {roles.find(([value]) => value === staffRole)?.[1] || staffRole}</strong>}
      </header>

      {error && <div role="alert" style={{ padding: 12, borderRadius: 8, background: '#5a2020' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 12, borderRadius: 8, background: 'var(--bg-secondary, #222)' }}>{notice}</div>}

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
        <Panel title="Configuration initiale du propriétaire">
          <p>Cette étape ne fonctionne que si aucun rôle du personnel n’a encore été attribué. Utilise la clé configurée côté serveur.</p>
          <Field label="Clé de configuration" value={bootstrapKey} onChange={setBootstrapKey} type="password" />
          <button style={buttonStyle} onClick={bootstrap}>Configurer ce compte comme propriétaire</button>
        </Panel>
      ) : (
        <>
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
                <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border-color, #444)', borderRadius: 8 }}>
                  <h3>Signalement sélectionné</h3>
                  <p>Type : {selectedReport.reportScope || 'message'} · Statut : {selectedReport.status}</p>
                  <p>Signalé par : {selectedReport.reporter?.username || 'Compte indisponible'}</p>
                  <p>Motif : {selectedReport.reason || 'Non précisé'}</p>
                  {selectedReport.reportScope === 'conversation' ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <strong>Conversation fournie avec le signalement</strong>
                      {(selectedReport.conversationSnapshot || []).map((message, index) => (
                        <article key={`${selectedReport._id}-${index}`} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-secondary, #222)' }}>
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
                  <code style={{ display: 'block', overflowWrap: 'anywhere', padding: 12, marginTop: 6, background: 'var(--bg-secondary, #222)' }}>{resetToken}</code>
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
                  {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                  <article key={log._id} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-secondary, #222)' }}>
                    <strong>{log.action}</strong>
                    <div>{log.actor?.username || 'Personnel inconnu'} → {log.targetUser?.username || 'aucune cible'}</div>
                    <small>{new Date(log.createdAt).toLocaleString()}</small>
                  </article>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </main>
  );
}
