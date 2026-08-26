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
                setAdminKey(e.target.value)
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
                setUsername(e.target.value)
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
                setNewPassword(e.target.value)
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
                opacity: passwordLoading
                  ? 0.7
                  : 1
              }}
              onClick={handleReset}
              disabled={passwordLoading}
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
                setAnnouncementKey(e.target.value)
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
                setAnnouncementTitle(e.target.value)
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
                setAnnouncementMessage(e.target.value)
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
                opacity: announcementLoading
                  ? 0.7
                  : 1
              }}
              onClick={handleCreateAnnouncement}
              disabled={announcementLoading}
            >
              {announcementLoading
                ? '...'
                : '📢 Publier l’annonce'}
            </button>

            <button
              style={{
                ...styles.deleteBtn,
                opacity: announcementLoading
                  ? 0.7
                  : 1
              }}
              onClick={handleDeleteAnnouncement}
              disabled={announcementLoading}
            >
              Désactiver l’annonce actuelle
            </button>

          </div>
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
  }
};