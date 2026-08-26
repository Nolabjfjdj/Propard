import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function GlobalAnnouncement() {
  const { user, token } = useAuth();

  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  const loadAnnouncement = async () => {
    if (!user || !token) {
      setAnnouncement(null);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await axios.get(
        '/api/announcements/active',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAnnouncement(
        response.data?.announcement || null
      );

    } catch (err) {
      console.error(
        'Erreur chargement annonce:',
        err
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !token) {
      setAnnouncement(null);
      return;
    }

    loadAnnouncement();

    /*
     * Vérification régulière.
     *
     * Cela permet aux utilisateurs déjà connectés de voir
     * une nouvelle annonce sans avoir besoin de recharger
     * la page.
     */
    const interval = setInterval(
      loadAnnouncement,
      5000
    );

    return () => clearInterval(interval);
  }, [user, token]);

  const acceptAnnouncement = async () => {
    if (
      !announcement ||
      !token ||
      accepting
    ) {
      return;
    }

    try {
      setAccepting(true);
      setError('');

      await axios.post(
        `/api/announcements/${announcement._id}/accept`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAnnouncement(null);

    } catch (err) {
      console.error(
        'Erreur acceptation annonce:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Impossible d’accepter l’annonce.'
      );

    } finally {
      setAccepting(false);
    }
  };

  if (
    !user ||
    !token ||
    loading ||
    !announcement
  ) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>

        <div style={styles.icon}>
          📢
        </div>

        <h2 style={styles.title}>
          {announcement.title}
        </h2>

        <div style={styles.message}>
          {announcement.message}
        </div>

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={acceptAnnouncement}
          disabled={accepting}
          style={{
            ...styles.button,
            opacity: accepting ? 0.7 : 1
          }}
        >
          {accepting
            ? '...'
            : "J'ai lu et j'accepte"}
        </button>

      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: 'rgba(0, 0, 0, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },

  card: {
    width: '100%',
    maxWidth: '520px',
    maxHeight: '80vh',
    overflowY: 'auto',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '32px',
    boxSizing: 'border-box',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)'
  },

  icon: {
    fontSize: '32px',
    marginBottom: '16px'
  },

  title: {
    margin: '0 0 18px',
    color: 'var(--text-primary)',
    fontSize: '22px',
    fontWeight: '700'
  },

  message: {
    color: 'var(--text-secondary)',
    fontSize: '15px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: '24px'
  },

  error: {
    color: 'var(--danger)',
    fontSize: '13px',
    marginBottom: '14px'
  },

  button: {
    width: '100%',
    border: 'none',
    borderRadius: '8px',
    padding: '13px 16px',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer'
  }
};