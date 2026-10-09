import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { markdownToHtml } from '../utils/markdown';

export default function AdminPage() {
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaContainerRef = useRef(null);
  const captchaWidgetRef = useRef(null);

  useEffect(() => {
    if (!captchaRequired) return;
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    const renderCaptcha = () => {
      if (!captchaContainerRef.current || !window.turnstile || captchaWidgetRef.current !== null) return;
      captchaWidgetRef.current = window.turnstile.render(captchaContainerRef.current, {
        sitekey: siteKey,
        callback: value => setCaptchaToken(value),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken('')
      });
    };

    if (window.turnstile) renderCaptcha();
    else {
      const existingScript = document.querySelector('script[data-propard-turnstile]');
      if (existingScript) existingScript.addEventListener('load', renderCaptcha, { once: true });
      else {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.propardTurnstile = 'true';
        script.addEventListener('load', renderCaptcha, { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      if (captchaWidgetRef.current !== null && window.turnstile) window.turnstile.remove(captchaWidgetRef.current);
      captchaWidgetRef.current = null;
    };
  }, [captchaRequired]);

  const postAdmin = async (url, payload) => {
    if (captchaRequired && !captchaToken) {
      throw new Error('Valide le CAPTCHA avant de continuer.');
    }

    try {
      return await postAdmin(url, {
        ...payload,
        ...(captchaToken ? { captchaToken } : {})
      });
    } catch (err) {
      if (err.response?.data?.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaToken('');
      } else if (captchaRequired) {
        setCaptchaToken('');
        if (captchaWidgetRef.current !== null && window.turnstile) {
          window.turnstile.reset(captchaWidgetRef.current);
        }
      }
      throw err;
    }
  };
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
  // BANNISSEMENTS
  // ============================

  const [banKey, setBanKey] = useState('');
  const [banUsername, setBanUsername] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');
  const [customDuration, setCustomDuration] = useState(1);
  const [customUnit, setCustomUnit] = useState('minutes');
  const [bannedUsers, setBannedUsers] = useState([]);
  const [bansError, setBansError] = useState('');
  const [bansResult, setBansResult] = useState('');
  const [bansLoading, setBansLoading] = useState(false);
  const [banActionLoading, setBanActionLoading] = useState(null);


  // ============================
  // CHARGER LES BANNIS
  // ============================

  const loadBannedUsers = async () => {
    if (!banKey) {
      setBansError('Entre la clé des bannissements');
      return;
    }

    setBansError('');
    setBansResult('');
    setBansLoading(true);

    try {
      const res = await postAdmin(
        '/api/admin/bans/list',
        { banKey }
      );

      setBannedUsers(res.data.users || []);
      setBansResult(
        `${res.data.users?.length || 0} compte(s) banni(s) chargé(s).`
      );
    } catch (err) {
      setBansError(
        err.response?.data?.error ||
        'Erreur lors du chargement des bannis'
      );
      setBannedUsers([]);
    } finally {
      setBansLoading(false);
    }
  };

  const banUser = async () => {
    if (!banKey || !banUsername.trim()) {
      setBansError('Entre la clé et le username à bannir');
      return;
    }

    const durationLabels = {
      '1h': '1 heure', '6h': '6 heures', '12h': '12 heures', '24h': '24 heures',
      '3d': '3 jours', '7d': '7 jours', '30d': '30 jours',
      permanent: 'définitivement', custom: `${customDuration} ${customUnit}`
    };

    if (banDuration === 'custom' && (!Number.isInteger(Number(customDuration)) || Number(customDuration) < 1 || Number(customDuration) > 36500)) {
      setBansError('La durée personnalisée doit être un nombre entier entre 1 et 36500.');
      return;
    }

    if (!window.confirm(
      `Bannir ${banDuration === 'permanent' ? 'définitivement' : 'pour ' + durationLabels[banDuration]} le compte « ${banUsername.trim()} » ?`
    )) {
      return;
    }

    setBansError('');
    setBansResult('');
    setBanActionLoading(banUsername.trim());

    try {
      const res = await postAdmin(
        '/api/admin/bans/ban',
        {
          banKey,
          username: banUsername.trim(),
          reason: banReason.trim(),
          duration: banDuration,
          ...(banDuration === 'custom'
            ? { customDuration: Number(customDuration), customUnit }
            : {})
        }
      );

      setBansResult(res.data.message);
      setBanUsername('');
      setBanReason('');
      setBanDuration('permanent');
      setCustomDuration(1);
      setCustomUnit('minutes');
      await loadBannedUsers();
    } catch (err) {
      setBansError(
        err.response?.data?.error ||
        'Erreur lors du bannissement'
      );
    } finally {
      setBanActionLoading(null);
    }
  };

  const unbanUser = async username => {
    if (!banKey) {
      setBansError('Entre d’abord la clé des bannissements');
      return;
    }

    if (!window.confirm(
      `Débannir le compte « ${username} » ?`
    )) {
      return;
    }

    setBansError('');
    setBansResult('');
    setBanActionLoading(username);

    try {
      const res = await postAdmin(
        '/api/admin/bans/unban',
        {
          banKey,
          username
        }
      );

      setBansResult(res.data.message);
      await loadBannedUsers();
    } catch (err) {
      setBansError(
        err.response?.data?.error ||
        'Erreur lors du débannissement'
      );
    } finally {
      setBanActionLoading(null);
    }
  };

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
      const res = await postAdmin(
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
      const res = await postAdmin(
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
      const res = await postAdmin(
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
      const res = await postAdmin(
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
      await postAdmin(
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
      await postAdmin(
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

          {captchaRequired && (
            <div style={{ marginTop: 12 }}>
              <p style={styles.description}>Vérification anti-bot requise après plusieurs tentatives.</p>
              <div ref={captchaContainerRef} />
              {!import.meta.env.VITE_TURNSTILE_SITE_KEY && (
                <p style={styles.error}>La clé publique Turnstile (VITE_TURNSTILE_SITE_KEY) n’est pas configurée.</p>
              )}
            </div>
          )}
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

            <div style={styles.markdownHint}>
              Markdown : **gras**, *italique*, ## titres, - listes, `code`,
              [liens](https://example.com) et blocs de code avec trois accents graves.
            </div>

            {announcementMessage.trim() && (
              <div style={styles.markdownPreview}>
                <div style={styles.markdownPreviewTitle}>
                  Aperçu
                </div>
                <div
                  style={styles.markdownContent}
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(announcementMessage)
                  }}
                />
              </div>
            )}

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
            BANNISSEMENTS
        ======================================== */}

        <section style={styles.card}>
          <div style={styles.reportHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                🚫 Bannissements
              </h2>

              <p style={styles.description}>
                Bannis ou débannis des comptes depuis le panneau
                d’administration. Le bannissement invalide les sessions
                actives et empêche toute nouvelle connexion.
              </p>
            </div>

            {bannedUsers.length > 0 && (
              <div style={styles.newBadge}>
                {bannedUsers.length} banni
                {bannedUsers.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div style={styles.form}>
            <label style={styles.label}>
              Clé des bannissements
            </label>

            <input
              style={styles.input}
              type="password"
              placeholder="ADMIN_KEY_BANS"
              value={banKey}
              onChange={e => setBanKey(e.target.value)}
              autoComplete="off"
            />

            <label style={styles.label}>
              Username à bannir
            </label>

            <input
              style={styles.input}
              type="text"
              placeholder="Ex: utilisateur123"
              value={banUsername}
              onChange={e => setBanUsername(e.target.value)}
              autoComplete="off"
              maxLength={20}
            />

            <label style={styles.label}>
              Durée du bannissement
            </label>

            <select
              style={styles.input}
              value={banDuration}
              onChange={e => setBanDuration(e.target.value)}
            >
              <option value="1h">1 heure</option>
              <option value="6h">6 heures</option>
              <option value="12h">12 heures</option>
              <option value="24h">24 heures</option>
              <option value="3d">3 jours</option>
              <option value="7d">7 jours</option>
              <option value="30d">30 jours</option>
              <option value="permanent">Permanent</option>
              <option value="custom">Personnalisé</option>
            </select>

            {banDuration === 'custom' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="number"
                  min="1"
                  max="36500"
                  step="1"
                  value={customDuration}
                  onChange={e => setCustomDuration(e.target.value)}
                  placeholder="Durée"
                />

                <select
                  style={{ ...styles.input, flex: 1 }}
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value)}
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Heures</option>
                  <option value="days">Jours</option>
                  <option value="weeks">Semaines</option>
                  <option value="months">Mois</option>
                  <option value="years">Années</option>
                </select>
              </div>
            )}

            <label style={styles.label}>
              Motif du bannissement
            </label>

            <textarea
              style={styles.textarea}
              placeholder="Motif interne du bannissement..."
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              maxLength={500}
            />

            {bansError && (
              <p style={styles.error}>
                {bansError}
              </p>
            )}

            {bansResult && (
              <p style={styles.success}>
                ✅ {bansResult}
              </p>
            )}

            <button
              style={{
                ...styles.btn,
                opacity: banActionLoading ? 0.7 : 1
              }}
              onClick={banUser}
              disabled={!!banActionLoading}
            >
              {banActionLoading ? '...' : '🚫 Bannir le compte'}
            </button>

            <button
              style={{
                ...styles.reopenBtn,
                width: '100%',
                marginTop: '4px',
                opacity: bansLoading ? 0.7 : 1
              }}
              onClick={loadBannedUsers}
              disabled={bansLoading || !!banActionLoading}
            >
              {bansLoading
                ? 'Chargement...'
                : '🔄 Actualiser les comptes bannis'}
            </button>
          </div>

          {bannedUsers.length > 0 ? (
            <div style={styles.bannedList}>
              {bannedUsers.map(user => (
                <div
                  key={user._id}
                  style={styles.bannedCard}
                >
                  <div style={styles.reportTop}>
                    <div>
                      <strong style={styles.bannedUsername}>
                        {user.username}
                      </strong>

                      {user.displayName && (
                        <span style={styles.bannedDisplayName}>
                          {user.displayName}
                        </span>
                      )}
                    </div>

                    <span style={styles.status}>
                      Banni
                    </span>
                  </div>

                  <div style={styles.reportInfo}>
                    <div>
                      <span style={styles.infoLabel}>
                        Date
                      </span>

                      <span style={styles.infoValue}>
                        {formatDate(user.bannedAt)}
                      </span>
                    </div>

                    <div>
                      <span style={styles.infoLabel}>
                        Fin
                      </span>

                      <span style={styles.infoValue}>
                        {user.banExpiresAt ? formatDate(user.banExpiresAt) : 'Permanent'}
                      </span>
                    </div>

                    <div>
                      <span style={styles.infoLabel}>
                        IP alias
                      </span>

                      <span style={styles.infoValue}>
                        {user.ipAlias || '?'}
                      </span>
                    </div>
                  </div>

                  {user.banReason && (
                    <div style={styles.reportBlock}>
                      <div style={styles.infoLabel}>
                        Motif
                      </div>

                      <div style={styles.reason}>
                        {user.banReason}
                      </div>
                    </div>
                  )}

                  <div style={styles.reportActions}>
                    <button
                      style={styles.reopenBtn}
                      onClick={() => unbanUser(user.username)}
                      disabled={
                        banActionLoading === user.username
                      }
                    >
                      {banActionLoading === user.username
                        ? '...'
                        : '✅ Débannir'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.emptyReports}>
              Aucun compte banni chargé.
            </div>
          )}
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
                        {report.reportScope === 'conversation' && report.messageType === 'group'
                          ? 'Conversation de groupe'
                          : report.reportedUser?.username || 'Compte supprimé'}
                      </span>
                    </div>

                    <div>
                      <span style={styles.infoLabel}>
                        {report.reportScope === 'conversation' ? 'Date du signalement' : 'Date du message'}
                      </span>

                      <span style={styles.infoValue}>
                        {formatDate(
                          report.reportScope === 'conversation'
                            ? report.createdAt
                            : report.messageCreatedAt
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
                      {report.reportScope === 'conversation' ? 'Conversation signalée' : 'Message signalé'}
                    </div>

                    <div style={styles.messageContent}>
                      {report.content}
                    </div>
                  </div>

                  {report.reportScope !== 'conversation' && (
                    <div style={styles.reportBlock}>
                      <div style={styles.infoLabel}>
                        Message ID
                      </div>
                      <code style={styles.messageId}>
                        {report.messageId}
                      </code>
                    </div>
                  )}

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

  markdownHint: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: '1.5'
  },

  markdownPreview: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '14px',
    marginTop: '4px'
  },

  markdownPreviewTitle: {
    color: 'var(--text-muted)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '10px'
  },

  markdownContent: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    lineHeight: '1.6',
    wordBreak: 'break-word'
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


  bannedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: '25px'
  },

  bannedCard: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '18px'
  },

  bannedUsername: {
    display: 'block',
    color: 'var(--text-primary)',
    fontSize: '15px',
    wordBreak: 'break-word'
  },

  bannedDisplayName: {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    marginTop: '3px'
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