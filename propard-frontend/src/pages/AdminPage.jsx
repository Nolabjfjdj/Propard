import { useState } from 'react';
import axios from 'axios';

export default function AdminPage() {
  // ============================
  // MOT DE PASSE
  // ============================

  const [adminKey, setAdminKey] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [passwordResult, setPasswordResult] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ============================
  // ANNONCE
  // ============================

  const [announcementKey, setAnnouncementKey] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');

  const [announcementResult, setAnnouncementResult] = useState('');
  const [announcementError, setAnnouncementError] = useState('');
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  // ============================
  // SIGNALEMENTS
  // ============================

  const [reportKey, setReportKey] = useState('');
  const [reports, setReports] = useState([]);
  const [newReportCount, setNewReportCount] = useState(0);

  const [reportsError, setReportsError] = useState('');
  const [reportsResult, setReportsResult] = useState('');
  const [reportsLoading, setReportsLoading] = useState(false);

  const [reportActionLoading, setReportActionLoading] = useState(null);

  // ============================
  // RESET PASSWORD
  // ============================

  const handleReset = async () => {
    if (
      !adminKey ||
      !username ||
      !newPassword
    ) {
      setPasswordError(
        'Remplis tous les champs'
      );
      return;
    }

    setPasswordError('');
    setPasswordResult('');
    setPasswordLoading(true);

    try {
      const res = await axios.post(
        '/api/admin/reset-password',
        {
          adminKey,
          username,
          newPassword
        }
      );

      setPasswordResult(
        res.data.message
      );

      setUsername('');
      setNewPassword('');

    } catch (err) {
      setPasswordError(
        err.response?.data?.error ||
        'Erreur'
      );

    } finally {
      setPasswordLoading(false);
    }
  };

  // ============================
  // CREATE ANNOUNCEMENT
  // ============================

  const handleCreateAnnouncement = async () => {
    if (
      !announcementKey ||
      !announcementTitle ||
      !announcementMessage
    ) {
      setAnnouncementError(
        'Remplis tous les champs'
      );
      return;
    }

    setAnnouncementError('');
    setAnnouncementResult('');
    setAnnouncementLoading(true);

    try {
      const res = await axios.post(
        '/api/admin/announcement/create',
        {
          announcementKey,
          title: announcementTitle,
          message: announcementMessage
        }
      );

      setAnnouncementResult(
        res.data.message
      );

      setAnnouncementTitle('');
      setAnnouncementMessage('');

    } catch (err) {
      setAnnouncementError(
        err.response?.data?.error ||
        'Erreur'
      );

    } finally {
      setAnnouncementLoading(false);
    }
  };

  // ============================
  // DELETE ANNOUNCEMENT
  // ============================

  const handleDeleteAnnouncement = async () => {
    if (!announcementKey) {
      setAnnouncementError(
        'Entre la clé annonce'
      );
      return;
    }

    setAnnouncementError('');
    setAnnouncementResult('');
    setAnnouncementLoading(true);

    try {
      const res = await axios.post(
        '/api/admin/announcement/delete',
        {
          announcementKey
        }
      );

      setAnnouncementResult(
        res.data.message
      );

    } catch (err) {
      setAnnouncementError(
        err.response?.data?.error ||
        'Erreur'
      );

    } finally {
      setAnnouncementLoading(false);
    }
  };

  // ============================
  // CHARGER LES SIGNALEMENTS
  // ============================

  const loadReports = async () => {
    if (!reportKey) {
      setReportsError(
        'Entre la clé des signalements'
      );
      return;
    }

    setReportsError('');
    setReportsResult('');
    setReportsLoading(true);

    try {
      const res = await axios.post(
        '/api/admin/reports/list',
        {
          reportKey
        }
      );

      setReports(
        res.data.reports || []
      );

      setNewReportCount(
        res.data.newCount || 0
      );

      setReportsResult(
        `${res.data.reports?.length || 0} signalement(s) chargé(s).`
      );

    } catch (err) {
      setReportsError(
        err.response?.data?.error ||
        'Erreur lors du chargement des signalements'
      );

      setReports([]);
      setNewReportCount(0);

    } finally {
      setReportsLoading(false);
    }
  };

  // ============================
  // CHANGER STATUT
  // ============================

  const updateReportStatus = async (
    reportId,
    status
  ) => {
    if (!reportKey) {
      setReportsError(
        'Entre d’abord la clé des signalements'
      );
      return;
    }

    setReportActionLoading(reportId);
    setReportsError('');
    setReportsResult('');

    try {
      await axios.post(
        `/api/admin/reports/${reportId}/status`,
        {
          reportKey,
          status
        }
      );

      setReports(prev =>
        prev.map(report =>
          report._id === reportId
            ? {
                ...report,
                status,
                processedAt:
                  status === 'new'
                    ? null
                    : new Date().toISOString()
              }
            : report
        )
      );

      setNewReportCount(prev => {
        const report =
          reports.find(
            item =>
              item._id === reportId
          );

        if (!report) {
          return prev;
        }

        if (
          report.status === 'new' &&
          status !== 'new'
        ) {
          return Math.max(
            0,
            prev - 1
          );
        }

        if (
          report.status !== 'new' &&
          status === 'new'
        ) {
          return prev + 1;
        }

        return prev;
      });

      setReportsResult(
        'Statut du signalement mis à jour.'
      );

    } catch (err) {
      setReportsError(
        err.response?.data?.error ||
        'Erreur lors de la modification du signalement'
      );

    } finally {
      setReportActionLoading(null);
    }
  };

  // ============================
  // SUPPRIMER SIGNALEMENT
  // ============================

  const deleteReport = async (
    reportId
  ) => {
    if (!reportKey) {
      setReportsError(
        'Entre d’abord la clé des signalements'
      );
      return;
    }

    const confirmed =
      window.confirm(
        'Supprimer définitivement ce signalement ?'
      );

    if (!confirmed) {
      return;
    }

    setReportActionLoading(reportId);
    setReportsError('');
    setReportsResult('');

    try {
      await axios.post(
        `/api/admin/reports/${reportId}/delete`,
        {
          reportKey
        }
      );

      const deletedReport =
        reports.find(
          report =>
            report._id === reportId
        );

      setReports(prev =>
        prev.filter(
          report =>
            report._id !== reportId
        )
      );

      if (
        deletedReport?.status === 'new'
      ) {
        setNewReportCount(prev =>
          Math.max(0, prev - 1)
        );
      }

      setReportsResult(
        'Signalement supprimé.'
      );

    } catch (err) {
      setReportsError(
        err.response?.data?.error ||
        'Erreur lors de la suppression du signalement'
      );

    } finally {
      setReportActionLoading(null);
    }
  };

  // ============================
  // HELPERS SIGNALEMENTS
  // ============================

  const getStatusLabel = status => {
    if (status === 'processed') {
      return 'Traité';
    }

    if (status === 'rejected') {
      return 'Rejeté';
    }

    return 'Nouveau';
  };

  const getStatusStyle = status => {
    if (status === 'processed') {
      return styles.statusProcessed;
    }

    if (status === 'rejected') {
      return styles.statusRejected;
    }

    return styles.statusNew;
  };

  const formatDate = date => {
    if (!date) {
      return '?';
    }

    try {
      return new Date(date).toLocaleString(
        'fr-FR'
      );
    } catch {
      return '?';
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <div style={styles.header}>
          <h1 style={styles.title}>
            ⚙️ Admin Propard
          </h1>

          <p style={styles.subtitle}>
            Panneau d'administration
          </p>
        </div>

        {/* ========================================
            RESET PASSWORD
        ======================================== */}

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>
            🔐 Réinitialisation de mot de passe
          </h2>

          <p style={styles.description}>
            Cette fonction utilise la clé
            d'administration principale.
          </p>

          <div style={styles.form}>

            <label style={styles.label}>
              Clé admin
            </label>

            <input
              style={styles.input}
              type="password"
              placeholder="Clé secrète"
              value={adminKey}
              onChange={e =>
                setAdminKey(
                  e.target.value
                )
              }
              autoComplete="off"
            />

            <label style={styles.label}>
              Username du compte
            </label>

            <input
              style={styles.input}
              type="text"
              placeholder="Ex: BananeVR"
              value={username}
              onChange={e =>
                setUsername(
                  e.target.value
                )
              }
              autoComplete="off"
            />

            <label style={styles.label}>
              Nouveau mot de passe
            </label>

            <input
              style={styles.input}
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={e =>
                setNewPassword(
                  e.target.value
                )
              }
              autoComplete="new-password"
            />

            {passwordError && (
              <p style={styles.error}>
                {passwordError}
              </p>
            )}

            {passwordResult && (
              <p style={styles.success}>
                ✅ {passwordResult}
              </p>
            )}

            <button
              style={{
                ...styles.btn,
                opacity:
                  passwordLoading
                    ? 0.7
                    : 1
              }}
              onClick={handleReset}
              disabled={
                passwordLoading
              }
            >
              {passwordLoading
                ? '...'
                : 'Réinitialiser'}
            </button>

          </div>
        </section>

        {/* ========================================
            ANNOUNCEMENT
        ======================================== */}

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>
            📢 Annonce globale
          </h2>

          <p style={styles.description}>
            L'annonce apparaîtra aux utilisateurs
            connectés et devra être acceptée.
            Après acceptation, elle disparaît
            pour ce compte.
          </p>

          <div style={styles.form}>

            <label style={styles.label}>
              Clé annonce
            </label>

            <input
              style={styles.input}
              type="password"
              placeholder="Clé secrète des annonces"
              value={announcementKey}
              onChange={e =>
                setAnnouncementKey(
                  e.target.value
                )
              }
              autoComplete="off"
            />

            <label style={styles.label}>
              Titre
            </label>

            <input
              style={styles.input}
              type="text"
              placeholder="Ex: Mise à jour importante"
              value={announcementTitle}
              onChange={e =>
                setAnnouncementTitle(
                  e.target.value
                )
              }
              maxLength={150}
            />

            <label style={styles.label}>
              Message
            </label>

            <textarea
              style={styles.textarea}
              placeholder="Contenu de l'annonce..."
              value={announcementMessage}
              onChange={e =>
                setAnnouncementMessage(
                  e.target.value
                )
              }
              maxLength={5000}
            />

            {announcementError && (
              <p style={styles.error}>
                {announcementError}
              </p>
            )}

            {announcementResult && (
              <p style={styles.success}>
                ✅ {announcementResult}
              </p>
            )}

            <button
              style={{
                ...styles.btn,
                opacity:
                  announcementLoading
                    ? 0.7
                    : 1
              }}
              onClick={
                handleCreateAnnouncement
              }
              disabled={
                announcementLoading
              }
            >
              {announcementLoading
                ? '...'
                : '📢 Publier l’annonce'}
            </button>

            <button
              style={{
                ...styles.deleteBtn,
                opacity:
                  announcementLoading
                    ? 0.7
                    : 1
              }}
              onClick={
                handleDeleteAnnouncement
              }
              disabled={
                announcementLoading
              }
            >
              Désactiver l’annonce actuelle
            </button>

          </div>
        </section>

        {/* ========================================
            SIGNALEMENTS
        ======================================== */}

        <section style={styles.card}>
          <div style={styles.reportHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                🚩 Signalements
              </h2>

              <p style={styles.description}>
                Les signalements envoyés par les
                utilisateurs sont enregistrés ici.
                Cette section est protégée par une
                clé d'administration séparée.
              </p>
            </div>

            {newReportCount > 0 && (
              <div style={styles.newBadge}>
                {newReportCount} nouveau
                {newReportCount > 1
                  ? 'x'
                  : ''}
              </div>
            )}
          </div>

          <div style={styles.form}>

            <label style={styles.label}>
              Clé des signalements
            </label>

            <input
              style={styles.input}
              type="password"
              placeholder="ADMIN_KEY_REPORTS"
              value={reportKey}
              onChange={e =>
                setReportKey(
                  e.target.value
                )
              }
              autoComplete="off"
            />

            {reportsError && (
              <p style={styles.error}>
                {reportsError}
              </p>
            )}

            {reportsResult && (
              <p style={styles.success}>
                ✅ {reportsResult}
              </p>
            )}

            <button
              style={{
                ...styles.btn,
                opacity:
                  reportsLoading
                    ? 0.7
                    : 1
              }}
              onClick={loadReports}
              disabled={reportsLoading}
            >
              {reportsLoading
                ? 'Chargement...'
                : '🚩 Charger les signalements'}
            </button>

          </div>

          {reports.length > 0 && (
            <div style={styles.reportsList}>

              {reports.map(report => (
                <div
                  key={report._id}
                  style={styles.reportCard}
                >

                  <div style={styles.reportTop}>
                    <div>
                      <span
                        style={{
                          ...styles.status,
                          ...getStatusStyle(
                            report.status
                          )
                        }}
                      >
                        {getStatusLabel(
                          report.status
                        )}
                      </span>
                    </div>

                    <span style={styles.reportDate}>
                      Signalé le{' '}
                      {formatDate(
                        report.createdAt
                      )}
                    </span>
                  </div>

                  <div style={styles.reportInfo}>

                    <div>
                      <span style={styles.infoLabel}>
                        Signalé par
                      </span>

                      <span style={styles.infoValue}>
                        {report.reporter?.username ||
                          'Compte supprimé'}
                      </span>
                    </div>

                    <div>
                      <span style={styles.infoLabel}>
                        Utilisateur signalé
                      </span>

                      <span style={styles.infoValue}>
                        {report.reportedUser?.username ||
                          'Compte supprimé'}
                      </span>
                    </div>

                    <div>
                      <span style={styles.infoLabel}>
                        Date du message
                      </span>

                      <span style={styles.infoValue}>
                        {formatDate(
                          report.messageCreatedAt
                        )}
                      </span>
                    </div>

                  </div>

                  <div style={styles.reportBlock}>
                    <div style={styles.infoLabel}>
                      Motif
                    </div>

                    <div style={styles.reason}>
                      {report.reason ||
                        'Aucun motif précisé'}
                    </div>
                  </div>

                  <div style={styles.reportBlock}>
                    <div style={styles.infoLabel}>
                      Message signalé
                    </div>

                    <div style={styles.messageContent}>
                      {report.content}
                    </div>
                  </div>

                  <div style={styles.reportBlock}>
                    <div style={styles.infoLabel}>
                      Message ID
                    </div>

                    <code style={styles.messageId}>
                      {report.messageId}
                    </code>
                  </div>

                  <div style={styles.reportActions}>

                    {report.status !== 'processed' && (
                      <button
                        style={styles.processBtn}
                        disabled={
                          reportActionLoading ===
                          report._id
                        }
                        onClick={() =>
                          updateReportStatus(
                            report._id,
                            'processed'
                          )
                        }
                      >
                        {reportActionLoading ===
                        report._id
                          ? '...'
                          : '✓ Marquer traité'}
                      </button>
                    )}

                    {report.status !== 'rejected' && (
                      <button
                        style={styles.rejectBtn}
                        disabled={
                          reportActionLoading ===
                          report._id
                        }
                        onClick={() =>
                          updateReportStatus(
                            report._id,
                            'rejected'
                          )
                        }
                      >
                        ✕ Rejeter
                      </button>
                    )}

                    {report.status !== 'new' && (
                      <button
                        style={styles.reopenBtn}
                        disabled={
                          reportActionLoading ===
                          report._id
                        }
                        onClick={() =>
                          updateReportStatus(
                            report._id,
                            'new'
                          )
                        }
                      >
                        ↩ Nouveau
                      </button>
                    )}

                    <button
                      style={styles.deleteReportBtn}
                      disabled={
                        reportActionLoading ===
                        report._id
                      }
                      onClick={() =>
                        deleteReport(
                          report._id
                        )
                      }
                    >
                      🗑 Supprimer
                    </button>

                  </div>

                </div>
              ))}

            </div>
          )}

          {!reportsLoading &&
            reports.length === 0 &&
            reportsResult && (
              <div style={styles.emptyReports}>
                Aucun signalement enregistré.
              </div>
            )}

        </section>

        <a
          href="/"
          style={styles.back}
        >
          ← Retour
        </a>

      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '40px 20px',
    boxSizing: 'border-box'
  },

  container: {
    width: '100%',
    maxWidth: '700px',
    margin: '0 auto'
  },

  header: {
    marginBottom: '28px'
  },

  title: {
    fontFamily: 'var(--font-mono)',
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  },

  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)'
  },

  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '30px',
    marginBottom: '20px'
  },

  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: '0 0 8px'
  },

  description: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'var(--text-secondary)',
    margin: '0 0 24px'
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },

  label: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '4px'
  },

  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },

  textarea: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '150px',
    resize: 'vertical',
    fontFamily: 'inherit'
  },

  btn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '8px',
    padding: '13px',
    fontSize: '15px',
    fontWeight: '600',
    border: 'none',
    cursor: 'pointer',
    marginTop: '8px'
  },

  deleteBtn: {
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '4px'
  },

  error: {
    color: 'var(--danger)',
    fontSize: '13px',
    margin: '5px 0'
  },

  success: {
    color: 'var(--success)',
    fontSize: '13px',
    margin: '5px 0'
  },

  back: {
    display: 'block',
    marginTop: '24px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textDecoration: 'none'
  },

  reportHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '15px'
  },

  newBadge: {
    flexShrink: 0,
    background: 'var(--danger)',
    color: '#fff',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: '700'
  },

  reportsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: '25px'
  },

  reportCard: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '18px'
  },

  reportTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px'
  },

  status: {
    display: 'inline-block',
    borderRadius: '999px',
    padding: '5px 9px',
    fontSize: '11px',
    fontWeight: '700'
  },

  statusNew: {
    background: 'rgba(231, 76, 60, 0.15)',
    color: 'var(--danger)'
  },

  statusProcessed: {
    background: 'rgba(46, 204, 113, 0.15)',
    color: 'var(--success)'
  },

  statusRejected: {
    background: 'rgba(127, 127, 127, 0.15)',
    color: 'var(--text-secondary)'
  },

  reportDate: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textAlign: 'right'
  },

  reportInfo: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    marginBottom: '18px'
  },

  infoLabel: {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '5px'
  },

  infoValue: {
    display: 'block',
    color: 'var(--text-primary)',
    fontSize: '13px',
    wordBreak: 'break-word'
  },

  reportBlock: {
    marginTop: '14px'
  },

  reason: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },

  messageContent: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },

  messageId: {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    wordBreak: 'break-all'
  },

  reportActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '20px'
  },

  processBtn: {
    background: 'var(--success)',
    color: '#fff',
    border: 'none',
    borderRadius: '7px',
    padding: '9px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  rejectBtn: {
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: '7px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  reopenBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '7px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  deleteReportBtn: {
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: '7px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    marginLeft: 'auto'
  },

  emptyReports: {
    marginTop: '20px',
    padding: '20px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    border: '1px dashed var(--border)',
    borderRadius: '8px'
  }
};