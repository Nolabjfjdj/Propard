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

function PaginationControls({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Éléments par page
      <select style={{ ...inputStyle, width: 'auto', marginTop: 0 }} value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))}>
        {[5, 10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}
      </select>
    </label>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <small style={{ color: 'var(--text-secondary)' }}>{first}–{last} sur {total}</small>
      <button type="button" style={{ ...buttonStyle, marginTop: 0 }} onClick={() => onPageChange(1)} disabled={page <= 1}>«</button>
      <button type="button" style={{ ...buttonStyle, marginTop: 0 }} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Précédent</button>
      <span style={{ fontSize: 13 }}>Page {Math.min(page, pageCount)} / {pageCount}</span>
      <button type="button" style={{ ...buttonStyle, marginTop: 0 }} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>Suivant</button>
      <button type="button" style={{ ...buttonStyle, marginTop: 0 }} onClick={() => onPageChange(pageCount)} disabled={page >= pageCount}>»</button>
    </div>
  </div>;
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
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsPageSize, setReportsPageSize] = useState(5);
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
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(5);
  const [expandedAuditLogId, setExpandedAuditLogId] = useState('');
  const [accountHelpRequests, setAccountHelpRequests] = useState([]);
  const [helpPage, setHelpPage] = useState(1);
  const [helpPageSize, setHelpPageSize] = useState(5);
  const [helpReplyDrafts, setHelpReplyDrafts] = useState({});
  const [helpReplySaving, setHelpReplySaving] = useState('');
  const [helpNotifications, setHelpNotifications] = useState({ passwordReset: true, support: true });
  const [staffEventPreferences, setStaffEventPreferences] = useState({ passwordReset: true, support: true, reports: true, bans: true, staffActions: true });
  const [staffEventPreferencesSaving, setStaffEventPreferencesSaving] = useState(false);
  const [staffNotifications, setStaffNotifications] = useState([]);
  const [staffNotificationsLoading, setStaffNotificationsLoading] = useState(false);
  const seenStaffEventIds = useRef(null);
  const [helpRequestsLoading, setHelpRequestsLoading] = useState(false);
  const [helpSettingsSaving, setHelpSettingsSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSettingsLoading, setPushSettingsLoading] = useState(false);
  const knownHelpRequestIds = useRef(null);
  const manualRecoveryRef = useRef(null);

  const request = useCallback(async (method, path, data) => {
    const token = localStorage.getItem('propard_token');
    if (!token) throw new Error('Connecte-toi à Propard pour accéder au personnel.');
    const config = { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' } };
    if (method === 'get') return api.get(path, config);
    if (method === 'patch') return api.patch(path, data, config);
    if (method === 'delete') return api.delete(path, config);
    return api.post(path, data, config);
  }, []);

  const loadAccountHelpRequests = useCallback(async ({ notify = false } = {}) => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    if (!notify) setHelpRequestsLoading(true);
    try {
      const response = await request('get', '/api/staff/account-help/requests');
      const incoming = response.data.requests || [];
      const preferences = response.data.notifications || { passwordReset: true, support: true };
      const requestSignatures = new Map(incoming.map(item => {
        const lastUserMessage = [...(item.messages || [])].reverse().find(message => message.senderType === 'user');
        return [item._id, lastUserMessage ? `${lastUserMessage.createdAt || ''}:${lastUserMessage.text || ''}` : ''];
      }));
      if (notify && knownHelpRequestIds.current) {
        const fresh = incoming.flatMap(item => {
          const previousSignature = knownHelpRequestIds.current.get(item._id);
          const signature = requestSignatures.get(item._id);
          const isNewRequest = previousSignature === undefined && item.status === 'new';
          const isNewUserMessage = previousSignature !== undefined && signature !== previousSignature &&
            [...(item.messages || [])].reverse().find(message => message.senderType === 'user');
          const enabled = item.kind === 'password_reset' ? preferences.passwordReset : preferences.support;
          if (!enabled || (!isNewRequest && !isNewUserMessage)) return [];
          return [{
            id: `help:${item._id}:${signature}`,
            category: item.kind === 'password_reset' ? 'passwordReset' : 'support',
            title: isNewRequest ? (item.kind === 'password_reset' ? 'Nouvelle demande de récupération' : 'Nouvelle demande de support') : 'Nouveau message de support',
            message: `@${item.username}${typeof isNewUserMessage === 'object' && isNewUserMessage.text ? ` · ${isNewUserMessage.text.slice(0, 100)}` : ''}`,
            createdAt: isNewUserMessage?.createdAt || item.createdAt
          }];
        });
        if (fresh.length) {
          setStaffNotifications(previous => [...fresh, ...previous].slice(0, 40));
          if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
            fresh.slice(0, 3).forEach(item => new window.Notification(item.title, { body: item.message }));
          }
        }
      }
      knownHelpRequestIds.current = requestSignatures;
      setAccountHelpRequests(incoming);
      setHelpNotifications(preferences);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les demandes de support.');
    } finally {
      if (!notify) setHelpRequestsLoading(false);
    }
  }, [request, staffRole]);

  const saveStaffEventPreferences = async nextPreferences => {
    setStaffEventPreferences(nextPreferences);
    setStaffEventPreferencesSaving(true);
    setError('');
    try {
      const response = await request('patch', '/api/staff/notifications/preferences', { preferences: nextPreferences });
      setStaffEventPreferences(response.data.preferences || nextPreferences);
      setNotice('Tes préférences de notifications du personnel ont été enregistrées.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer les notifications.');
      try {
        const response = await request('get', '/api/staff/notifications/preferences');
        setStaffEventPreferences(response.data.preferences || { reports: true, bans: true, staffActions: true });
      } catch {}
    } finally {
      setStaffEventPreferencesSaving(false);
    }
  };

  const loadStaffEvents = useCallback(async ({ notify = false } = {}) => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    if (!notify) setStaffNotificationsLoading(true);
    try {
      const [eventsResponse, preferencesResponse] = await Promise.all([
        request('get', '/api/staff/notifications/events'),
        request('get', '/api/staff/notifications/preferences')
      ]);
      const events = eventsResponse.data.events || [];
      const reports = eventsResponse.data.reports || [];
      const preferences = preferencesResponse.data.preferences || { reports: true, bans: true, staffActions: true };
      setStaffEventPreferences(preferences);
      const normalized = [
        ...reports.map(report => ({
          id: `report:${report._id}`,
          category: 'reports',
          title: 'Nouveau signalement',
          message: report.reason ? `Motif : ${report.reason}` : (report.reportScope === 'conversation' ? 'Signalement de conversation' : 'Signalement de message'),
          createdAt: report.createdAt
        })),
        ...events.map(event => {
          const category = ['user.banned', 'user.unbanned'].includes(event.action) ? 'bans' : 'staffActions';
          const actionLabels = {
            'user.banned': 'Bannissement appliqué',
            'user.unbanned': 'Compte débanni',
            'staff.user.permanently_deleted': 'Compte supprimé définitivement',
            'staff.role.updated': 'Rôle du personnel modifié',
            'report.status.updated': 'Statut d’un signalement modifié',
            'report.deleted': 'Signalement supprimé',
            'account_help.reply_updated': 'Réponse de support envoyée',
            'account_help.status_updated': 'Demande de support mise à jour',
            'account_help.request_deleted': 'Demande de support supprimée',
            'account_help.recovery_code_issued': 'Code de récupération créé',
            'user.password_reset.issued': 'Code de réinitialisation créé',
            'user.password_reset.completed': 'Mot de passe réinitialisé',
            'staff.bootstrap.completed': 'Propriétaire initial configuré'
          };
          return {
            id: `audit:${event._id}`,
            category,
            title: actionLabels[event.action] || 'Action du personnel',
            message: event.targetUsername ? `Compte concerné : @${event.targetUsername} · par @${event.actorUsername}` : `Action effectuée par @${event.actorUsername}`,
            createdAt: event.createdAt
          };
        })
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (seenStaffEventIds.current === null) {
        seenStaffEventIds.current = new Set(normalized.map(item => item.id));
      } else if (notify) {
        const fresh = normalized.filter(item =>
          !seenStaffEventIds.current.has(item.id) &&
          preferences[item.category] !== false
        );
        if (fresh.length) {
          setStaffNotifications(previous => [...fresh, ...previous].slice(0, 40));
          if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
            fresh.slice(0, 3).forEach(item => new window.Notification(item.title, { body: item.message }));
          }
        }
        normalized.forEach(item => seenStaffEventIds.current.add(item.id));
      }
      setStaffNotifications(previous => {
        const merged = [...previous];
        for (const item of normalized) {
          if (!merged.some(existing => existing.id === item.id)) merged.push(item);
        }
        return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 40);
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les notifications du personnel.');
    } finally {
      if (!notify) setStaffNotificationsLoading(false);
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

  const deleteHelpRequest = async item => {
    if (!item || item.status !== 'resolved') return;
    const confirmed = window.confirm('Supprimer définitivement cette demande de support ou de récupération ? Cette action est irréversible. Le journal d’audit sera conservé.');
    if (!confirmed) return;
    setError('');
    try {
      await request('delete', `/api/staff/account-help/requests/${item._id}`);
      setAccountHelpRequests(previous => previous.filter(entry => entry._id !== item._id));
      setNotice('Demande supprimée manuellement. Le journal d’audit est conservé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer cette demande.');
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

  useEffect(() => {
    if (!['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole)) return;
    loadStaffEvents();
    const interval = window.setInterval(() => loadStaffEvents({ notify: true }), 8000);
    return () => window.clearInterval(interval);
  }, [staffRole, loadStaffEvents]);

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

  const permanentlyDeleteAccount = async () => {
    if (!lookupResult?._id) return;
    const expectedUsername = lookupResult.username;
    const confirmation = window.prompt(
      `Suppression DÉFINITIVE de @${expectedUsername}. Toutes les données du compte seront supprimées, sans délai de 30 jours. Pour confirmer, saisis exactement le pseudo :`
    );
    if (confirmation !== expectedUsername) {
      if (confirmation !== null) setError('Confirmation incorrecte. Aucune suppression effectuée.');
      return;
    }
    setError('');
    setNotice('');
    try {
      const response = await request('delete', `/api/staff/users/${encodeURIComponent(lookupResult._id)}/permanent`);
      setNotice(response.data.message || 'Compte supprimé définitivement.');
      setLookupResult(null);
      setLookupUsername('');
      setTargetUserId('');
      setResetUserId('');
      setRoleUserId('');
      setResetToken('');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer définitivement ce compte.');
    }
  };

  const loadReports = async () => {
    setError('');
    try {
      const response = await request('get', '/api/staff/reports');
      setReports(response.data.reports || []);
      setReportsPage(1);
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

  const deleteReport = async () => {
    if (!selectedReport || !['processed', 'rejected'].includes(selectedReport.status)) return;
    const confirmed = window.confirm('Supprimer définitivement ce signalement ? Cette action est irréversible. Elle ne supprimera pas les journaux d’audit.');
    if (!confirmed) return;
    setError('');
    try {
      await request('delete', `/api/staff/reports/${selectedReport._id}`);
      setReports(previous => previous.filter(report => report._id !== selectedReport._id));
      setSelectedReport(null);
      setNotice('Signalement supprimé manuellement. L’action reste inscrite dans le journal d’audit.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer le signalement.');
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
      setLookupResult(previous => previous && previous._id?.toString() === roleUserId.trim()
        ? { ...previous, staffRole: newRole }
        : previous);
      setNotice(newRole === 'user'
        ? 'Le compte est redevenu un utilisateur normal.'
        : 'Rôle du personnel mis à jour.');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de modifier le rôle.');
    }
  };

  const loadAudit = async () => {
    setError('');
    try {
      const response = await request('get', '/api/staff/audit');
      setAuditLogs(response.data.logs || []);
      setAuditPage(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger le journal d’audit.');
    }
  };

  const undoAuditAction = async log => {
    const actor = log.actorUsername || log.actor?.username || 'Personnel';
    if (!window.confirm(`Annuler l’action « ${log.action} » effectuée par ${actor} ? Cette opération sera elle-même inscrite au journal d’audit.`)) return;
    setError('');
    setNotice('');
    try {
      const response = await request('post', `/api/staff/audit/${encodeURIComponent(log._id)}/undo`, {});
      setNotice(response.data.message || 'Action annulée.');
      await loadAudit();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Impossible d’annuler cette action.');
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
        <Panel title="Notifications du personnel">
          <p>Configure uniquement tes propres notifications. Les nouveaux signalements, bannissements/débannissements et actions importantes du personnel sont vérifiés automatiquement pendant que le panneau est ouvert.</p>
          <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
            {[
              ['reports', 'Nouveaux signalements'],
              ['bans', 'Bannissements et débannissements'],
              ['staffActions', 'Autres actions du personnel']
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={staffEventPreferences[key] !== false}
                  disabled={staffEventPreferencesSaving}
                  onChange={event => saveStaffEventPreferences({ ...staffEventPreferences, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                if (typeof window.Notification === 'undefined') {
                  setError('Les notifications système ne sont pas prises en charge par ce navigateur.');
                  return;
                }
                window.Notification.requestPermission().then(permission => {
                  setNotice(permission === 'granted' ? 'Notifications système autorisées.' : 'Notifications système non autorisées. Les notifications restent visibles dans le panneau staff.');
                });
              }}
            >
              Autoriser les notifications système
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <strong>Activité récente</strong>
            {staffNotifications.slice(0, 12).map(item => (
              <article key={item.id} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{item.title}</strong>
                  <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{item.message}</div>
              </article>
            ))}
            {!staffNotifications.length && <small style={{ color: 'var(--text-secondary)' }}>Aucune activité récente détectée pour le moment.</small>}
            <button type="button" style={buttonStyle} onClick={() => loadStaffEvents()} disabled={staffNotificationsLoading}>Actualiser les notifications</button>
          </div>
        </Panel>
      )}

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
              {staffRole === 'owner' && lookupResult.staffRole !== 'owner' && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                    Suppression immédiate et irréversible. Le compte et ses données associées seront retirés de la base de données, sans période de récupération de 30 jours.
                  </p>
                  <button
                    type="button"
                    style={{ ...buttonStyle, background: '#a32626', borderColor: '#a32626' }}
                    onClick={permanentlyDeleteAccount}
                  >
                    Supprimer définitivement le compte
                  </button>
                </div>
              )}
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
              <PaginationControls total={accountHelpRequests.length} page={helpPage} pageSize={helpPageSize} onPageChange={setHelpPage} onPageSizeChange={size => { setHelpPageSize(size); setHelpPage(1); }} />
              {accountHelpRequests.slice((helpPage - 1) * helpPageSize, helpPage * helpPageSize).map(item => (
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
                    {['senior_moderator', 'admin', 'owner'].includes(staffRole) && item.status === 'resolved' && (
                      <button
                        type="button"
                        style={{ ...buttonStyle, background: '#a32626', borderColor: '#a32626' }}
                        onClick={() => deleteHelpRequest(item)}
                      >
                        Supprimer la demande résolue
                      </button>
                    )}
                    {item.userId && (
                      <button
                        type="button"
                        style={buttonStyle}
                        onClick={() => {
                          setResetUserId(item.userId._id || item.userId);
                          setResetToken('');
                          setError('');
                          setNotice(`Récupération manuelle ouverte pour @${item.username}. Vérifie l’identité du demandeur avant de créer un code.`);
                          manualRecoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                      >
                        Ouvrir la récupération manuelle
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!accountHelpRequests.length && !helpRequestsLoading && <p style={{ color: 'var(--text-secondary)' }}>Aucune demande pour le moment.</p>}
              {!!accountHelpRequests.length && <PaginationControls total={accountHelpRequests.length} page={helpPage} pageSize={helpPageSize} onPageChange={setHelpPage} onPageSizeChange={size => { setHelpPageSize(size); setHelpPage(1); }} />}
            </div>
          </Panel>

          {['junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'].includes(staffRole) && (
            <Panel title="Signalements">
              <p>La liste ne charge pas le contenu complet des conversations. Ouvre un signalement pour consulter les détails selon tes permissions.</p>
              <button style={buttonStyle} onClick={loadReports}>Charger les signalements</button>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <PaginationControls total={reports.length} page={reportsPage} pageSize={reportsPageSize} onPageChange={setReportsPage} onPageSizeChange={size => { setReportsPageSize(size); setReportsPage(1); }} />
                {reports.slice((reportsPage - 1) * reportsPageSize, reportsPage * reportsPageSize).map(report => (
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
                    {['senior_moderator', 'admin', 'owner'].includes(staffRole) && ['processed', 'rejected'].includes(selectedReport.status) && (
                      <button type="button" style={{ ...buttonStyle, background: '#a52b2b' }} onClick={deleteReport}>Supprimer le signalement</button>
                    )}
                  </div>
                  {['processed', 'rejected'].includes(selectedReport.status) && <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>Ce signalement est terminé. Sa suppression est manuelle et irréversible ; elle ne se déclenche jamais automatiquement.</small>}
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
            <div ref={manualRecoveryRef}>
            <Panel title="Aide à la récupération de compte">
              <p>Utilise cet outil pour une demande de mot de passe oublié ou pour aider manuellement un utilisateur qui t’a contacté via le support. Le personnel ne choisit pas et ne voit jamais le nouveau mot de passe. Le code est à usage unique et expire après 15 minutes. Remets le code au propriétaire du compte par un canal vérifié et demande-lui d’ouvrir <code>/password-reset</code>. La réinitialisation peut supprimer la sauvegarde E2EE chiffrée avec l’ancien mot de passe.</p>
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
            </div>
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
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Le propriétaire peut annuler certaines actions réversibles. Les annulations sont ajoutées au journal et les actions plus récentes ne sont pas écrasées.</p>
                <PaginationControls total={auditLogs.length} page={auditPage} pageSize={auditPageSize} onPageChange={setAuditPage} onPageSizeChange={size => { setAuditPageSize(size); setAuditPage(1); }} />
                {auditLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize).map(log => {
                  const undoneIds = new Set(auditLogs.filter(item => item.action === 'audit.action.undone').map(item => item.details?.originalLogId));
                  const undoable = ['user.banned', 'staff.role.updated', 'report.status.updated'].includes(log.action);
                  return (
                    <article key={log._id} style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                      <strong>{log.action}</strong>
                      <div>{log.actorUsername || log.actor?.username || log.details?.actorUsername || (log.actorId ? `Compte introuvable (${log.actorId.slice(-6)})` : 'Personnel inconnu')} → {log.targetUsername || log.targetUser?.username || log.details?.username || (log.targetUserId ? `Compte introuvable (${log.targetUserId.slice(-6)})` : 'aucune cible')}</div>
                      <small style={{ display: 'block' }}>{new Date(log.createdAt).toLocaleString()}</small>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <button type="button" style={{ ...buttonStyle, marginTop: 0, padding: '4px 8px', fontSize: 12, fontWeight: 500, background: 'transparent', color: 'var(--text-primary)' }} onClick={() => setExpandedAuditLogId(current => current === log._id ? '' : log._id)}>{expandedAuditLogId === log._id ? 'Masquer les infos' : 'Plus d’infos'}</button>
                      </div>
                      {expandedAuditLogId === log._id && (
                        <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, overflowWrap: 'anywhere' }}>
                          <div><strong>ID de l’action :</strong> {log._id}</div>
                          <div><strong>Action :</strong> {log.action}</div>
                          <div><strong>Acteur :</strong> {log.actorUsername || log.actor?.username || 'Inconnu'} {log.actorId ? '(' + log.actorId + ')' : ''}</div>
                          <div><strong>Cible :</strong> {log.targetUsername || log.targetUser?.username || log.details?.username || 'Aucune'} {log.targetUserId ? '(' + log.targetUserId + ')' : ''}</div>
                          {log.targetReport && <div><strong>ID du signalement :</strong> {typeof log.targetReport === 'object' ? log.targetReport._id : log.targetReport}</div>}
                          {log.ip && <div><strong>Adresse IP enregistrée :</strong> {log.ip}</div>}
                          {log.userAgent && <div><strong>Appareil / navigateur :</strong> {log.userAgent}</div>}
                          {log.details && <div style={{ marginTop: 6 }}><strong>Détails techniques :</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, marginBottom: 0 }}>{JSON.stringify(log.details, null, 2)}</pre></div>}
                        </div>
                      )}
                      {staffRole === 'owner' && undoable && !undoneIds.has(log._id) && (
                        <div style={{ marginTop: 8 }}>
                          <button type="button" style={{ ...buttonStyle, borderColor: '#b45309' }} onClick={() => undoAuditAction(log)}>Annuler cette action</button>
                        </div>
                      )}
                      {staffRole === 'owner' && undoneIds.has(log._id) && <small style={{ display: 'block', marginTop: 6 }}>Action déjà annulée</small>}
                    </article>
                  );
                })}
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
