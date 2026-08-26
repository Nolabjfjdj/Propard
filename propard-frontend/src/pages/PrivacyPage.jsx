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
          <p style={styles.text}>Lors de la création et de l'utilisation d'un compte, Propard peut collecter et stocker :</p>
          <ul style={styles.list}>
            <li>Un nom d'utilisateur (pseudo) choisi librement</li>
            <li>Un mot de passe stocké sous forme de hachage sécurisé avec bcrypt</li>
            <li>Une adresse IP alias générée aléatoirement, utilisée comme identifiant technique sur la plateforme</li>
            <li>La date de création du compte</li>
            <li>Le statut en ligne / hors ligne en temps réel</li>
            <li>Les données nécessaires au fonctionnement de la messagerie et à la gestion du compte</li>
            <li>Les informations nécessaires au traitement d'un signalement lorsqu'un utilisateur signale un contenu</li>
          </ul>
          <p style={styles.text}>
            Propard ne demande pas directement aux utilisateurs leur adresse e-mail ou leur numéro de téléphone pour créer un compte.
          </p>
          <p style={styles.text}>
            Des données techniques peuvent toutefois être traitées par les prestataires utilisés pour assurer l'hébergement, la sécurité et le fonctionnement du service, conformément à leurs propres politiques et aux obligations applicables.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Utilisation des données</h2>
          <p style={styles.text}>Les données collectées sont utilisées notamment pour :</p>
          <ul style={styles.list}>
            <li>Créer et gérer votre compte</li>
            <li>Vous identifier sur la plateforme</li>
            <li>Permettre la communication avec vos amis</li>
            <li>Afficher votre statut en ligne</li>
            <li>Assurer la sécurité et le bon fonctionnement du service</li>
            <li>Traiter les signalements de contenus effectués par les utilisateurs</li>
            <li>Respecter les obligations légales applicables au service</li>
          </ul>
          <p style={styles.text}>
            Selon le traitement concerné, le traitement des données peut être fondé notamment sur la nécessité d'assurer le fonctionnement du service, sur le respect d'une obligation légale ou sur l'intérêt légitime du responsable du traitement, lorsque cette base est applicable.
          </p>
          <p style={styles.text}>
            Vos données ne sont pas vendues ni louées à des fins commerciales.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Messages privés et chiffrement</h2>

          <p style={styles.text}>
            Les messages échangés entre utilisateurs sont chiffrés de bout en bout (E2EE) avant d'être envoyés à nos serveurs. Dans le fonctionnement normal du service, le contenu des messages est donc stocké sous forme chiffrée dans notre base de données et Propard ne peut pas lire leur contenu.
          </p>

          <p style={styles.text}>
            La clé privée nécessaire au déchiffrement est conservée uniquement sur l'appareil de l'utilisateur et n'est pas envoyée à nos serveurs. En conséquence, Propard ne peut normalement pas déchiffrer ou récupérer le contenu des messages à la place de l'utilisateur.
          </p>

          <p style={styles.text}>
            Si cette clé privée est perdue, les messages chiffrés associés peuvent devenir définitivement illisibles.
          </p>

          <p style={styles.text}>
            Lorsqu'un utilisateur utilise la fonctionnalité « Signaler » sur un message, les informations nécessaires au traitement du signalement peuvent être transmises à Propard, notamment le contenu du message signalé lorsque cela est nécessaire. Cette transmission intervient à la suite de l'action volontaire de l'utilisateur qui effectue le signalement.
          </p>

          <p style={styles.text}>
            Le contenu transmis dans le cadre d'un signalement peut être examiné afin de déterminer si le contenu signalé constitue une violation des présentes CGU ou de la réglementation applicable et afin de permettre à Propard de prendre les mesures appropriées.
          </p>

          <p style={styles.text}>
            Les messages supprimés sont supprimés de la base de données utilisée par le service. Des copies techniques temporaires peuvent toutefois subsister lorsqu'elles sont nécessaires au fonctionnement, à la sécurité ou aux obligations légales applicables.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Hébergement et prestataires</h2>
          <p style={styles.text}>
            Le site est hébergé sur les serveurs de <strong>Render</strong> et la base de données est hébergée sur <strong>MongoDB Atlas</strong>.
          </p>
          <p style={styles.text}>
            Certains prestataires techniques peuvent traiter ou stocker des données en dehors de l'Union européenne. Lorsque des transferts de données personnelles hors de l'Union européenne sont réalisés, ils sont encadrés conformément aux exigences du RGPD et au mécanisme juridique applicable au transfert concerné.
          </p>
          <p style={styles.text}>
            Les prestataires techniques peuvent notamment intervenir pour l'hébergement, le stockage des données, la sécurité et le fonctionnement technique de Propard.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Durée de conservation</h2>
          <p style={styles.text}>
            Les données nécessaires au fonctionnement du compte sont conservées pendant la durée nécessaire à la fourniture du service, généralement tant que le compte existe.
          </p>
          <p style={styles.text}>
            En cas de suppression du compte, les données associées sont supprimées de la base de données utilisée par le service, sous réserve des données dont la conservation peut être nécessaire pour respecter une obligation légale, assurer la sécurité du service ou gérer un litige.
          </p>
          <p style={styles.text}>
            Les messages sont conservés tant qu'ils sont nécessaires au fonctionnement de la messagerie ou jusqu'à leur suppression, sous réserve des nécessités techniques ou des obligations légales applicables.
          </p>
          <p style={styles.text}>
            Les informations relatives aux signalements peuvent être conservées pendant la durée nécessaire à leur traitement, au suivi d'une éventuelle contestation ou au respect des obligations légales applicables.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Vos droits (RGPD)</h2>
          <p style={styles.text}>
            Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez, selon les conditions et limites prévues par la réglementation, notamment des droits suivants :
          </p>
          <ul style={styles.list}>
            <li><strong>Droit d'accès</strong> : obtenir une copie des données personnelles vous concernant</li>
            <li><strong>Droit de rectification</strong> : demander la correction de données inexactes</li>
            <li><strong>Droit à l'effacement</strong> : demander la suppression de vos données lorsque les conditions légales sont réunies</li>
            <li><strong>Droit à la limitation</strong> : demander, dans certains cas, la limitation du traitement de vos données</li>
            <li><strong>Droit d'opposition</strong> : vous opposer à certains traitements lorsque les conditions légales sont réunies</li>
            <li><strong>Droit à la portabilité</strong> : recevoir certaines données dans un format structuré et couramment utilisé lorsque ce droit est applicable</li>
          </ul>
          <p style={styles.text}>
            Pour exercer vos droits, contactez-nous à <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>.
          </p>
          <p style={styles.text}>
            Nous traiterons votre demande dans les délais prévus par le RGPD. Nous pouvons être amenés à demander des informations permettant de vérifier votre identité lorsque cela est nécessaire pour protéger vos données.
          </p>
          <p style={styles.text}>
            Vous disposez également du droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL), notamment si vous estimez que le traitement de vos données personnelles n'est pas conforme à la réglementation applicable.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>8. Cookies et stockage local</h2>
          <p style={styles.text}>
            Propard n'utilise pas de cookies de tracking ou publicitaires.
          </p>
          <p style={styles.text}>
            Le stockage local du navigateur (localStorage) peut être utilisé pour mémoriser votre session de connexion et vos préférences d'affichage, notamment le thème clair/sombre.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>9. Contact</h2>
          <p style={styles.text}>
            Pour toute question relative à cette politique de confidentialité ou pour exercer vos droits :
            {" "}
            <a href="mailto:propard@outlook.fr" style={styles.link}>propard@outlook.fr</a>
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