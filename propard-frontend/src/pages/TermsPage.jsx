export default function TermsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/help" style={styles.back}>← Retour</a>
        <h1 style={styles.title}>Conditions Générales d'Utilisation</h1>
        <p style={styles.date}>En vigueur depuis le 12 avril 2026</p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Présentation du service</h2>
          <p style={styles.text}>
            Propard (<a href="https://propard.site" style={styles.link}>propard.site</a>) est une plateforme de messagerie instantanée permettant à des utilisateurs de communiquer via des adresses IP aliases anonymes. Le service est développé et exploité par BananeVR, particulier domicilié en France.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Acceptation des CGU</h2>
          <p style={styles.text}>
            En créant un compte sur Propard, vous acceptez sans réserve les présentes Conditions Générales d'Utilisation. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser le service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Accès au service</h2>
          <p style={styles.text}>
            L'accès à Propard est gratuit et ouvert à toute personne âgée d'au moins 13 ans. Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Règles de comportement</h2>
          <p style={styles.text}>En utilisant Propard, vous vous engagez à ne pas :</p>
          <ul style={styles.list}>
            <li>Harceler, menacer ou intimider d'autres utilisateurs</li>
            <li>Diffuser des contenus illégaux, haineux, pornographiques ou violents</li>
            <li>Usurper l'identité d'une autre personne</li>
            <li>Tenter de pirater, compromettre ou surcharger les serveurs du service (DDoS, injection, etc.)</li>
            <li>Utiliser le service à des fins commerciales sans autorisation</li>
            <li>Créer des comptes automatisés (bots) sans autorisation explicite</li>
            <li>Diffuser des logiciels malveillants ou des liens frauduleux</li>
          </ul>
          <p style={styles.text}>
            Tout manquement à ces règles peut entraîner la suspension ou la suppression définitive du compte concerné, sans préavis.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Statut d'hébergeur technique</h2>
          <p style={styles.text}>
            Conformément à la loi pour la Confiance dans l'Économie Numérique (LCEN) du 21 juin 2004, Propard agit en qualité d'hébergeur technique des contenus publiés par ses utilisateurs. À ce titre, Propard n'est pas responsable des contenus publiés par les utilisateurs et ne procède à aucune modération préalable des messages privés.
          </p>
          <p style={styles.text}>
            Toutefois, Propard se réserve le droit de supprimer tout contenu manifestement illicite qui lui serait signalé, et de collaborer avec les autorités judiciaires compétentes si la loi l'exige.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Propriété intellectuelle</h2>
          <p style={styles.text}>
            Le nom "Propard", le logo et le code source de la plateforme sont la propriété de BananeVR. Toute reproduction ou utilisation sans autorisation est interdite. Les contenus publiés par les utilisateurs (messages) restent leur propriété.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Disponibilité du service</h2>
          <p style={styles.text}>
            Propard est un service fourni sans garantie de disponibilité continue. Des interruptions peuvent survenir pour des raisons de maintenance ou techniques. Propard ne saurait être tenu responsable des préjudices liés à une interruption de service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>8. Modification des CGU</h2>
          <p style={styles.text}>
            Propard se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés des modifications importantes. La continuité de l'utilisation du service après modification vaut acceptation des nouvelles conditions.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>9. Droit applicable</h2>
          <p style={styles.text}>
            Les présentes CGU sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français seront seuls compétents.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>10. Contact</h2>
          <p style={styles.text}>
            Pour toute question relative aux présentes CGU : <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center', padding: '40px 16px' },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px', width: '100%', maxWidth: '700px', height: 'fit-content' },
  back: { fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'block', marginBottom: '24px' },
  title: { fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
  date: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '32px' },
  section: { marginBottom: '28px' },
  sectionTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' },
  text: { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '8px' },
  list: { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7', paddingLeft: '20px', marginBottom: '8px' },
  link: { color: 'var(--accent)', textDecoration: 'none' }
};
