export default function HelpPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/" style={styles.back}>← Retour</a>
        <h1 style={styles.title}>Propard<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p style={styles.subtitle}>Centre d'aide</p>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>❓ Comment ça marche ?</h2>
          <p style={styles.text}>Propard est une application de messagerie qui utilise des adresses IP aliases pour identifier les utilisateurs. Chaque compte reçoit une adresse unique générée aléatoirement.</p>
        </div>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>👥 Ajouter un ami</h2>
          <p style={styles.text}>Pour ajouter un ami, demande-lui son adresse IP alias et entre-la dans "Ajouter un ami". Il devra accepter ta demande.</p>
        </div>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🙈 Masquer mon adresse</h2>
          <p style={styles.text}>Tu peux masquer ton adresse IP alias (et celles de tes amis) en cliquant sur le bouton "Masquer" dans la sidebar. Utile quand tu stream !</p>
        </div>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>✏️ Modifier / Supprimer un message</h2>
          <p style={styles.text}>Fais un clic droit sur un de tes messages pour le modifier ou le supprimer.</p>
        </div>
        <div style={styles.divider} />
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📬 Nous contacter</h2>
          <p style={styles.text}>Tu as un problème ou une suggestion ? Contacte-nous !</p>
          <a href="/help/contact" style={styles.contactBtn}>Envoyer un message</a>
          <a href="https://github.com/Nolabjfjdj/Propard" target="_blank" rel="noreferrer" style={styles.sourceLink}>
            &lt;/&gt; Code source
          </a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center', padding: '40px 16px' },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px', width: '100%', maxWidth: '600px', height: 'fit-content' },
  back: { fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'block', marginBottom: '24px' },
  title: { fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' },
  section: { marginBottom: '24px' },
  sectionTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' },
  text: { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' },
  divider: { height: '1px', background: 'var(--border)', margin: '24px 0' },
  contactBtn: { display: 'inline-block', marginTop: '12px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' },
  sourceLink: { display: 'block', marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }
};
