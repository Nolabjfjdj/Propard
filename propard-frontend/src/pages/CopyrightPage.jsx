export default function CopyrightPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/help" style={styles.back}>← Retour au centre d'aide</a>

        <h1 style={styles.title}>Copyright et propriété intellectuelle</h1>
        <p style={styles.date}>© 2026 Propard. Tous droits réservés.</p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Titulaire des droits</h2>
          <p style={styles.text}>
            Propard est un projet développé indépendamment par BananeVR.
            Le code source est publié sur GitHub à des fins de transparence,
            d'inspection technique et d'analyse. Cette publication ne signifie
            pas que le projet est librement réutilisable.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Éléments protégés</h2>
          <p style={styles.text}>
            Sous réserve des droits de tiers, les éléments propres à Propard
            peuvent notamment comprendre le code source, l'interface, le design,
            les textes, les éléments graphiques, le logo et l'identité visuelle
            du site.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Utilisation et reproduction</h2>
          <p style={styles.text}>
            Sauf autorisation écrite préalable du titulaire des droits ou
            disposition légale applicable, il est interdit de copier, reproduire,
            modifier, redistribuer ou exploiter les éléments protégés de Propard.
            La consultation publique du dépôt GitHub n'accorde pas, à elle seule,
            une autorisation de réutilisation.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Dépendances et contenus de tiers</h2>
          <p style={styles.text}>
            Les bibliothèques, dépendances et autres éléments appartenant à des
            tiers restent soumis à leurs propres licences et conditions. Cette
            page ne prétend pas modifier les droits de leurs titulaires.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Code source</h2>
          <p style={styles.text}>
            Le dépôt officiel est accessible à l'adresse suivante :
          </p>
          <a
            href="https://github.com/Nolabjfjdj/Propard"
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            github.com/Nolabjfjdj/Propard
          </a>
          <p style={styles.text}>
            Le fichier LICENSE du dépôt contient les conditions de propriété
            intellectuelle applicables au code source. En cas de différence,
            consultez ce fichier ainsi que les licences propres aux dépendances.
          </p>
        </div>

        <div style={styles.notice}>
          © 2026 Propard. Tous droits réservés.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 16px'
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '40px',
    width: '100%',
    maxWidth: '700px',
    height: 'fit-content'
  },
  back: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    display: 'block',
    marginBottom: '24px'
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    lineHeight: '1.35',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  },
  date: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '32px'
  },
  section: {
    marginBottom: '26px'
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '10px'
  },
  text: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: '1.7',
    marginBottom: '12px'
  },
  link: {
    display: 'inline-block',
    fontSize: '14px',
    color: 'var(--accent)',
    textDecoration: 'none',
    overflowWrap: 'anywhere',
    marginBottom: '12px'
  },
  notice: {
    borderTop: '1px solid var(--border)',
    paddingTop: '20px',
    marginTop: '8px',
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center'
  }
};
