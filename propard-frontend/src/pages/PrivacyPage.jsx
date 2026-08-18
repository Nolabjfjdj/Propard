export default function PrivacyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/help" style={styles.back}>← Retour</a>
        <h1 style={styles.title}>Politique de Confidentialité</h1>
        <p style={styles.date}>En vigueur depuis le 12 avril 2026</p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Responsable du traitement</h2>
          <p style={styles.text}>
            Propard est un projet personnel développé et exploité par BananeVR, particulier domicilié en France.
            Contact : <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Données collectées</h2>
          <p style={styles.text}>Lors de la création d'un compte, Propard collecte et stocke :</p>
          <ul style={styles.list}>
            <li>Un nom d'utilisateur (pseudo) choisi librement</li>
            <li>Un mot de passe chiffré (hashé via bcrypt, nous ne pouvons pas le lire)</li>
            <li>Une adresse IP alias générée aléatoirement (ce n'est pas votre vraie adresse IP)</li>
            <li>La date de création du compte</li>
            <li>Le statut en ligne / hors ligne en temps réel</li>
          </ul>
          <p style={styles.text}>
            Nous ne collectons pas votre vraie adresse IP, votre adresse e-mail, votre numéro de téléphone ou toute autre donnée personnelle identifiable.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Utilisation des données</h2>
          <p style={styles.text}>Les données collectées sont utilisées uniquement pour :</p>
          <ul style={styles.list}>
            <li>Vous identifier sur la plateforme</li>
            <li>Permettre la communication avec vos amis</li>
            <li>Afficher votre statut en ligne</li>
          </ul>
          <p style={styles.text}>
            Vos données ne sont jamais vendues, louées ou transmises à des tiers à des fins commerciales.
          </p>
        </div>

        <div style={styles.section}>
  <h2 style={styles.sectionTitle}>4. Messages privés</h2>
  <p style={styles.text}>
    Les messages échangés entre utilisateurs sont chiffrés de bout en bout (E2EE) avant d'être envoyés à nos serveurs. Le contenu des messages est donc stocké sous forme chiffrée dans notre base de données et nous ne pouvons pas lire leur contenu.
  </p>
  <p style={styles.text}>
    La clé privée nécessaire au déchiffrement est conservée uniquement sur l'appareil de l'utilisateur et n'est jamais envoyée à nos serveurs. En conséquence, nous ne pouvons pas déchiffrer ou récupérer le contenu de vos messages à votre place. Si cette clé privée est perdue, les messages chiffrés associés peuvent devenir définitivement illisibles.
  </p>
  <p style={styles.text}>
    Les messages supprimés sont définitivement effacés de notre base de données.
  </p>
</div>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Hébergement</h2>
          <p style={styles.text}>
            Le site est hébergé sur les serveurs de <strong>Render</strong> (États-Unis) et la base de données est hébergée sur <strong>MongoDB Atlas</strong>. Les données peuvent donc être stockées en dehors de l'Union européenne, sur des serveurs conformes aux standards de sécurité internationaux.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Durée de conservation</h2>
          <p style={styles.text}>
            Vos données sont conservées tant que votre compte existe. En cas de suppression de compte, toutes vos données personnelles et vos messages sont définitivement supprimés de notre base de données.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Vos droits (RGPD)</h2>
          <p style={styles.text}>Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
          <ul style={styles.list}>
            <li><strong>Droit d'accès</strong> : consulter les données que nous détenons sur vous</li>
            <li><strong>Droit de rectification</strong> : corriger vos données</li>
            <li><strong>Droit à l'effacement</strong> : supprimer définitivement votre compte et toutes vos données</li>
            <li><strong>Droit à la portabilité</strong> : obtenir une copie de vos données</li>
          </ul>
          <p style={styles.text}>
            Pour exercer ces droits, contactez-nous à <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>. Nous répondrons dans un délai maximum de 30 jours.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>8. Cookies</h2>
          <p style={styles.text}>
            Propard n'utilise pas de cookies de tracking ou publicitaires. Seul le stockage local du navigateur (localStorage) est utilisé pour mémoriser votre session de connexion et vos préférences d'affichage (thème clair/sombre).
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>9. Contact</h2>
          <p style={styles.text}>
            Pour toute question relative à cette politique de confidentialité : <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>
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
