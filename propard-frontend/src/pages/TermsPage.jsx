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
            Propard (<a href="https://propard.site" style={styles.link}>propard.site</a>)
            est une plateforme de messagerie instantanée permettant à des utilisateurs
            de communiquer via des adresses IP aliases anonymes.
          </p>
          <p style={styles.text}>
            Le service est développé et exploité par BananeVR, particulier domicilié en France.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Acceptation des CGU</h2>
          <p style={styles.text}>
            En créant un compte sur Propard, vous acceptez les présentes Conditions
            Générales d'Utilisation. Si vous n'acceptez pas ces conditions, vous ne
            devez pas utiliser le service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Accès au service</h2>
          <p style={styles.text}>
            L'accès à Propard est gratuit et ouvert aux personnes âgées d'au moins 13 ans.
          </p>
          <p style={styles.text}>
            Chaque utilisateur est responsable de la confidentialité de ses identifiants
            de connexion et de l'utilisation effectuée depuis son compte.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Règles de comportement</h2>

          <p style={styles.text}>
            En utilisant Propard, vous vous engagez à ne pas :
          </p>

          <ul style={styles.list}>
            <li>Harceler, menacer ou intimider d'autres utilisateurs</li>
            <li>Diffuser des contenus ou utiliser le service à des fins illégales</li>
            <li>Diffuser des contenus haineux, pornographiques ou faisant l'apologie de violences</li>
            <li>Usurper l'identité d'une autre personne</li>
            <li>Tenter de pirater, compromettre ou surcharger les serveurs du service, notamment par DDoS ou injection</li>
            <li>Exploiter une vulnérabilité ou contourner volontairement les mesures de sécurité du service</li>
            <li>Utiliser le service à des fins commerciales sans autorisation</li>
            <li>Créer ou utiliser des comptes automatisés (bots) sans autorisation explicite</li>
            <li>Diffuser des logiciels malveillants, du phishing ou des liens frauduleux</li>
            <li>Utiliser Propard pour porter atteinte aux droits ou à la sécurité d'autrui</li>
          </ul>

          <p style={styles.text}>
            Tout manquement aux présentes règles peut entraîner la suspension,
            la restriction ou la suppression définitive du compte concerné.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Messages privés et chiffrement</h2>

          <p style={styles.text}>
            Les communications privées échangées sur Propard utilisent un système
            de chiffrement de bout en bout (E2EE).
          </p>

          <p style={styles.text}>
            Dans le fonctionnement normal du service, le contenu des messages privés
            chiffrés n'est pas accessible en clair à Propard. Le chiffrement a notamment
            pour objectif de protéger la confidentialité des communications entre les
            utilisateurs.
          </p>

          <p style={styles.text}>
            Propard ne procède pas à une lecture ou à une modération préalable du contenu
            des conversations privées.
          </p>

          <p style={styles.text}>
            Les utilisateurs restent responsables de l'utilisation qu'ils font du service
            et doivent respecter les présentes CGU ainsi que les lois et règlements
            applicables.
          </p>

          <p style={styles.text}>
            Propard peut mettre en place des mécanismes permettant aux utilisateurs de
            signaler certains contenus. Lorsqu'un mécanisme de signalement est disponible,
            les modalités applicables seront précisées dans le service et, le cas échéant,
            dans les présentes CGU.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Contenus des utilisateurs et signalements</h2>

          <p style={styles.text}>
            Les contenus transmis ou publiés par les utilisateurs demeurent sous la
            responsabilité de leurs auteurs.
          </p>

          <p style={styles.text}>
            Propard peut prendre les mesures appropriées lorsqu'il a connaissance d'un
            contenu ou d'une utilisation contraire aux présentes CGU ou à la réglementation
            applicable, dans les limites de ses possibilités techniques et de ses obligations
            légales.
          </p>

          <p style={styles.text}>
            Lorsque la loi applicable l'exige, Propard peut être amené à répondre aux
            demandes des autorités compétentes et à coopérer avec celles-ci dans les
            conditions prévues par la loi.
          </p>

          <p style={styles.text}>
            Les éventuelles mesures prises à l'encontre d'un compte ou d'un contenu peuvent
            notamment comprendre la suppression d'un contenu lorsque cela est techniquement
            possible, la restriction de certaines fonctionnalités, la suspension ou la
            suppression du compte.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Propriété intellectuelle</h2>

          <p style={styles.text}>
            Le nom "Propard", le logo et le code source de la plateforme sont la propriété
            de BananeVR, sous réserve des composants, bibliothèques et éléments tiers
            utilisés par le service.
          </p>

          <p style={styles.text}>
            Les contenus créés et transmis par les utilisateurs restent la propriété de
            leurs auteurs, sous réserve des droits éventuellement accordés à Propard pour
            assurer le fonctionnement technique du service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>8. Disponibilité du service</h2>

          <p style={styles.text}>
            Propard est fourni sans garantie de disponibilité continue. Des interruptions
            peuvent survenir notamment pour des raisons de maintenance, de sécurité ou
            de contraintes techniques.
          </p>

          <p style={styles.text}>
            Dans les limites autorisées par la réglementation applicable, Propard ne saurait
            être tenu responsable des conséquences résultant d'une interruption ou d'une
            indisponibilité du service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>9. Modification des CGU</h2>

          <p style={styles.text}>
            Propard se réserve le droit de modifier les présentes CGU afin notamment de
            tenir compte de l'évolution du service, de ses fonctionnalités ou de la
            réglementation applicable.
          </p>

          <p style={styles.text}>
            Les utilisateurs seront informés des modifications importantes dans des
            conditions appropriées. La poursuite de l'utilisation du service après
            l'entrée en vigueur des nouvelles conditions vaut acceptation de celles-ci,
            sous réserve des règles impératives applicables.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>10. Droit applicable</h2>

          <p style={styles.text}>
            Les présentes CGU sont soumises au droit français, sous réserve des dispositions
            impératives du droit applicable aux utilisateurs.
          </p>

          <p style={styles.text}>
            En cas de litige, les parties rechercheront en priorité une résolution amiable.
            Les règles de compétence juridictionnelle applicables déterminent la juridiction
            pouvant être saisie.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>11. Contact</h2>

          <p style={styles.text}>
            Pour toute question relative aux présentes CGU :
            {" "}
            <a
              href="mailto:propard@outlook.fr"
              style={styles.link}
            >
              propard@outlook.fr
            </a>
          </p>
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
    fontFamily: 'var(--font-mono)',
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  },

  date: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '32px'
  },

  section: {
    marginBottom: '28px'
  },

  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '10px'
  },

  text: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: '1.7',
    marginBottom: '8px'
  },

  list: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: '1.7',
    paddingLeft: '20px',
    marginBottom: '8px'
  },

  link: {
    color: 'var(--accent)',
    textDecoration: 'none'
  }
};