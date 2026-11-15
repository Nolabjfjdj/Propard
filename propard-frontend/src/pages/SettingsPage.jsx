import { useState } from 'react';

export default function SettingsPage() {
  const [section, setSection] = useState('main');

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

  const heading = section === 'main'
    ? 'Paramètres'
    : section === 'security'
      ? 'Sécurité'
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
          <button type="button" style={styles.row} onClick={() => setSection('a2f')}>
            <span style={styles.icon}>⌑</span>
            <span style={styles.rowContent}>
              <strong>A2F</strong>
              <small>Authentification à deux facteurs</small>
            </span>
            <span style={styles.arrow}>›</span>
          </button>
        )}
        {section === 'a2f' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <strong>Clé de sécurité</strong>
                <p style={styles.description}>Créer et gérer les clés d'accès de ton compte Propard.</p>
              </div>
              <span style={styles.keyIcon}>⌑</span>
            </div>
            <div style={styles.empty}>
              <strong>Aucune clé enregistrée</strong>
              <p>Tu pourras enregistrer une clé d'accès et retrouver ici toutes les clés associées à ton compte.</p>
            </div>
            <button type="button" style={styles.primary} disabled>
              Nouveau
            </button>
            <p style={styles.notice}>L'enregistrement sécurisé des clés sera activé dans la prochaine étape.</p>
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
    textAlign: 'center'
  },
  primary: {
    width: '100%',
    border: 0,
    borderRadius: '9px',
    padding: '12px 16px',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'not-allowed',
    opacity: 0.55
  },
  notice: {
    margin: '10px 0 0',
    color: 'var(--text-muted)',
    fontSize: '12px',
    textAlign: 'center'
  }
};
