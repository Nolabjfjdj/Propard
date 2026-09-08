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
            Propard est un projet personnel développé et exploité par BananeVR,
            particulier domicilié en France.
          </p>

          <p style={styles.text}>
            Pour toute question relative à la protection des données personnelles
            ou pour exercer vos droits, vous pouvez contacter :
          </p>

          <p style={styles.text}>
            <a href="mailto:support@propard.site" style={styles.link}>
              support@propard.site
            </a>
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Données traitées</h2>

          <p style={styles.text}>
            Propard applique un principe de minimisation des données et ne demande
            pas, pour la création d'un compte, d'adresse e-mail ou de numéro de
            téléphone.
          </p>

          <p style={styles.text}>
            Selon l'utilisation du service, les catégories de données suivantes
            peuvent être traitées :
          </p>

          <ul style={styles.list}>
            <li>
              Un nom d'utilisateur (pseudo) choisi par l'utilisateur
            </li>
            <li>
              Un nom d'affichage lorsqu'il est renseigné
            </li>
            <li>
              Un avatar lorsqu'il est renseigné
            </li>
            <li>
              Un mot de passe conservé sous forme de hachage et non sous sa
              forme lisible
            </li>
            <li>
              Une adresse IP alias générée aléatoirement et utilisée comme
              identifiant technique sur la plateforme
            </li>
            <li>
              La date de création du compte
            </li>
            <li>
              Le statut en ligne ou hors ligne nécessaire au fonctionnement
              de certaines fonctionnalités
            </li>
            <li>
              Les relations entre utilisateurs nécessaires au fonctionnement
              des amis, demandes d'amis et blocages
            </li>
            <li>
              Les surnoms éventuellement associés aux relations d'amis
            </li>
            <li>
              Une clé publique cryptographique utilisée pour permettre le
              chiffrement de bout en bout des communications
            </li>
            <li>
              Les informations nécessaires au fonctionnement de la messagerie
            </li>
            <li>
              Les informations relatives à certaines annonces et à leur
              acceptation lorsqu'une telle fonctionnalité est utilisée
            </li>
            <li>
              Les informations nécessaires au traitement des signalements
              effectués par les utilisateurs
            </li>
            <li>
              Certaines données techniques nécessaires à la sécurité et au
              fonctionnement du service
            </li>
          </ul>

          <p style={styles.text}>
            Propard ne demande pas directement votre adresse e-mail ou votre
            numéro de téléphone pour créer un compte.
          </p>

          <p style={styles.text}>
            Propard ne collecte ni ne stocke volontairement les adresses IP des
            utilisateurs dans la base de données des comptes à des fins
            d'identification des utilisateurs. Le fonctionnement de
            l'infrastructure d'hébergement peut toutefois entraîner la création
            de journaux techniques par les prestataires d'infrastructure,
            indépendamment des données enregistrées par Propard dans sa propre
            base de données.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Finalités et bases juridiques</h2>

          <p style={styles.text}>
            Les données personnelles sont traitées uniquement pour des finalités
            déterminées et légitimes. Selon la nature du traitement, les bases
            juridiques utilisées sont notamment les suivantes :
          </p>

          <ul style={styles.list}>
            <li>
              <strong>Création et gestion du compte :</strong> exécution du
              contrat permettant l'utilisation du service.
            </li>
            <li>
              <strong>Authentification et accès au compte :</strong> exécution
              du contrat et sécurité du service.
            </li>
            <li>
              <strong>Messagerie et fonctionnalités sociales :</strong>
              exécution du contrat et fourniture des fonctionnalités demandées
              par l'utilisateur.
            </li>
            <li>
              <strong>Chiffrement et gestion des clés publiques :</strong>
              exécution du contrat et sécurité des communications.
            </li>
            <li>
              <strong>Sécurité, prévention des abus et protection du service :</strong>
              intérêt légitime de Propard à maintenir un service sécurisé,
              fonctionnel et à prévenir les utilisations abusives.
            </li>
            <li>
              <strong>Traitement des signalements :</strong> intérêt légitime
              de Propard à faire respecter les règles du service et, lorsque
              cela est applicable, respect des obligations légales.
            </li>
            <li>
              <strong>Respect d'une obligation légale :</strong> lorsque la loi
              impose à Propard de conserver ou de communiquer certaines données.
            </li>
          </ul>

          <p style={styles.text}>
            Lorsqu'un traitement repose sur l'intérêt légitime, Propard veille
            à prendre en compte les droits et libertés des personnes concernées
            ainsi que leurs attentes raisonnables.
          </p>

          <p style={styles.text}>
            Propard ne vend ni ne loue les données personnelles de ses
            utilisateurs à des fins commerciales.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Messages privés et chiffrement de bout en bout</h2>

          <p style={styles.text}>
            Les messages privés sont chiffrés de bout en bout (E2EE) avant leur
            transmission au serveur dans le fonctionnement normal du service.
            Le serveur reçoit et stocke donc le contenu des messages sous une
            forme chiffrée.
          </p>

          <p style={styles.text}>
            La clé privée nécessaire au déchiffrement est conservée localement
            sur l'appareil de l'utilisateur et n'est pas transmise au serveur
            dans le fonctionnement normal du système.
          </p>

          <p style={styles.text}>
            Propard ne dispose donc normalement pas de la clé privée permettant
            de déchiffrer les messages privés stockés sur ses serveurs.
          </p>

          <p style={styles.text}>
            La perte de la clé privée peut rendre définitivement inaccessible le
            contenu de certains messages chiffrés.
          </p>

          <p style={styles.text}>
            L'implémentation du chiffrement constitue une mesure technique de
            protection des communications. Elle n'est pas présentée comme ayant
            fait l'objet d'un audit cryptographique professionnel indépendant.
          </p>

          <p style={styles.text}>
            La fonctionnalité « Signaler » constitue une exception volontaire au
            fonctionnement habituel du chiffrement. Lorsqu'un utilisateur
            signale un message, les informations nécessaires au traitement du
            signalement peuvent être transmises à Propard, notamment le contenu
            du message signalé lorsque cela est nécessaire.
          </p>

          <p style={styles.text}>
            Le contenu transmis lors d'un signalement peut être examiné afin de
            déterminer si le contenu enfreint les CGU ou la réglementation
            applicable et afin de permettre la prise de mesures appropriées.
          </p>

          <p style={styles.text}>
            Les messages supprimés sont supprimés de la base de données utilisée
            par le service. Des copies techniques temporaires peuvent toutefois
            subsister lorsqu'elles sont nécessaires au fonctionnement, à la
            sécurité ou au respect d'une obligation légale.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Signalements et destinataires</h2>

          <p style={styles.text}>
            Lorsqu'un utilisateur effectue un signalement, Propard peut traiter
            notamment l'identifiant du message, les utilisateurs concernés, le
            motif du signalement, la date du message et le contenu signalé
            lorsque celui-ci est nécessaire au traitement du signalement.
          </p>

          <p style={styles.text}>
            Dans le fonctionnement actuellement utilisé par Propard, les
            informations nécessaires au traitement du signalement peuvent être
            transmises automatiquement à Discord via un webhook configuré par
            Propard.
          </p>

          <p style={styles.text}>
            Les informations transmises peuvent notamment comprendre le contenu
            du message signalé lorsqu'il est nécessaire à l'examen du
            signalement, ainsi que les informations permettant d'identifier le
            signalement et les utilisateurs concernés.
          </p>

          <p style={styles.text}>
            Ces informations sont transmises à un salon Discord privé dédié aux
            signalements. Ce salon est configuré de manière à ce que seul le
            responsable de Propard puisse y accéder. La transmission à Discord
            reste toutefois nécessaire pour acheminer les informations vers ce
            salon.
          </p>

          <p style={styles.text}>
            Les informations transmises à Discord sont utilisées uniquement afin
            de permettre au responsable de Propard d'examiner et de traiter les
            signalements. Elles ne sont pas utilisées à des fins publicitaires
            ou commerciales.
          </p>

          <p style={styles.text}>
            L'utilisation de Discord pour recevoir les signalements constitue
            une solution temporaire. Propard prévoit de remplacer ce système par
            un système de signalement directement intégré au site. À terme, les
            signalements seront traités exclusivement au sein de Propard et ne
            seront plus transmis à Discord.
          </p>

          <p style={styles.text}>
            Propard ne conserve pas volontairement une copie supplémentaire du
            contenu signalé dans une base de données dédiée aux signalements
            lorsque cette conservation n'est pas nécessaire au fonctionnement
            du service.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Hébergement et prestataires techniques</h2>

          <p style={styles.text}>
            Propard utilise plusieurs prestataires techniques nécessaires à son
            fonctionnement, notamment :
          </p>

          <ul style={styles.list}>
            <li>
              <strong>Render</strong> pour l'hébergement et l'exécution du
              service ;
            </li>
            <li>
              <strong>MongoDB Atlas</strong> pour l'hébergement de la base de
              données ;
            </li>
            <li>
              <strong>Discord</strong> pour la réception temporaire des
              notifications et informations relatives aux signalements dans le
              cadre du système actuellement utilisé ;
            </li>
            <li>
              <strong>Metered</strong> pour certains services techniques liés
              au relais TURN utilisé lors des communications en temps réel.
            </li>
          </ul>

          <p style={styles.text}>
            Ces prestataires peuvent traiter certaines données personnelles
            nécessaires à leurs fonctions respectives. Leur intervention est
            limitée aux finalités techniques pour lesquelles ils sont utilisés.
          </p>

          <p style={styles.text}>
            Certains prestataires peuvent traiter ou stocker des données en
            dehors de l'Union européenne. Lorsque des données personnelles sont
            transférées vers un pays situé en dehors de l'Espace économique
            européen, Propard applique ou exige l'application du mécanisme de
            transfert prévu par le RGPD lorsqu'il est applicable, notamment une
            décision d'adéquation ou des garanties appropriées.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Durées de conservation</h2>

          <p style={styles.text}>
            Propard ne conserve pas les données personnelles plus longtemps que
            nécessaire aux finalités pour lesquelles elles sont traitées, sous
            réserve des durées pouvant être imposées par la loi ou nécessaires à
            la constatation, à l'exercice ou à la défense de droits en justice.
          </p>

          <ul style={styles.list}>
            <li>
              <strong>Données du compte :</strong> pendant la durée d'existence
              du compte, sous réserve des périodes de conservation ou
              d'archivage nécessaires pour des raisons légales ou de sécurité.
            </li>
            <li>
              <strong>Suppression du compte :</strong> les données destinées à
              être supprimées sont supprimées conformément au fonctionnement du
              service. Lorsqu'une période de restauration de 30 jours est
              applicable, certaines données restent temporairement conservées
              pendant cette période afin de permettre la restauration du compte.
            </li>
            <li>
              <strong>Messages :</strong> pendant la durée nécessaire au
              fonctionnement de la messagerie, jusqu'à leur suppression ou
              jusqu'à la suppression définitive du compte, sous réserve des
              obligations légales applicables.
            </li>
            <li>
              <strong>Signalements :</strong> pendant la durée nécessaire à leur
              traitement, à la gestion d'une contestation éventuelle ou au
              respect d'une obligation légale. Lorsque le système temporaire
              utilisant Discord est actif, les informations transmises à Discord
              sont utilisées dans le cadre du traitement des signalements et
              cessent d'être transmises à Discord lorsque ce système est remplacé
              par le système de signalement interne de Propard.
            </li>
            <li>
              <strong>Données techniques et de sécurité :</strong> pendant la
              durée nécessaire à la sécurité et au fonctionnement du service,
              selon les politiques de conservation applicables aux prestataires
              concernés.
            </li>
          </ul>

          <p style={styles.text}>
            Les durées de conservation peuvent différer selon la finalité et la
            catégorie de données concernée. Les données devenues inutiles sont
            supprimées, anonymisées ou archivées lorsque la réglementation le
            permet ou l'impose.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>8. Suppression du compte</h2>

          <p style={styles.text}>
            L'utilisateur peut demander la suppression de son compte selon les
            fonctionnalités proposées par Propard.
          </p>

          <p style={styles.text}>
            Lorsqu'une période de restauration de 30 jours est prévue, le compte
            est temporairement rendu inactif et certaines informations sont
            conservées pendant cette période afin de permettre une restauration
            volontaire.
          </p>

          <p style={styles.text}>
            À l'issue de cette période, lorsque la suppression définitive est
            effectuée, les données du compte et les relations associées sont
            supprimées conformément au fonctionnement du service, sous réserve
            des données qui doivent être conservées pour respecter une
            obligation légale, assurer la sécurité ou défendre des droits en
            justice.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>9. Mineurs</h2>

          <p style={styles.text}>
            Propard peut être utilisé par des personnes mineures dans les limites
            prévues par ses CGU et la réglementation applicable.
          </p>

          <p style={styles.text}>
            Lorsque le traitement de données personnelles d'un mineur repose
            sur le consentement dans le cadre d'un service de la société de
            l'information, les règles françaises relatives au consentement des
            mineurs s'appliquent. En France, lorsqu'un tel traitement repose sur
            le consentement et concerne un enfant de moins de 15 ans, le
            consentement doit être donné ou autorisé dans les conditions prévues
            par la réglementation, notamment avec l'intervention du titulaire
            de l'autorité parentale lorsque celle-ci est requise.
          </p>

          <p style={styles.text}>
            Les traitements nécessaires au fonctionnement du service ne sont pas
            automatiquement fondés sur le consentement. Leur base juridique est
            déterminée en fonction de leur finalité, conformément au RGPD.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>10. Vos droits au titre du RGPD</h2>

          <p style={styles.text}>
            Conformément au RGPD et dans les conditions prévues par celui-ci,
            vous disposez notamment des droits suivants :
          </p>

          <ul style={styles.list}>
            <li>
              <strong>Droit d'accès :</strong> obtenir la confirmation que vos
              données sont traitées et, lorsque les conditions sont réunies,
              obtenir une copie de celles-ci.
            </li>
            <li>
              <strong>Droit de rectification :</strong> demander la correction
              de données personnelles inexactes ou incomplètes.
            </li>
            <li>
              <strong>Droit à l'effacement :</strong> demander la suppression
              de vos données lorsque les conditions légales sont réunies.
            </li>
            <li>
              <strong>Droit à la limitation :</strong> demander la limitation
              temporaire de certains traitements dans les situations prévues
              par le RGPD.
            </li>
            <li>
              <strong>Droit d'opposition :</strong> vous opposer à certains
              traitements fondés sur l'intérêt légitime lorsque les conditions
              légales sont réunies.
            </li>
            <li>
              <strong>Droit à la portabilité :</strong> recevoir certaines
              données personnelles dans un format structuré, couramment utilisé
              et lisible par machine lorsque les conditions du droit à la
              portabilité sont réunies.
            </li>
          </ul>

          <p style={styles.text}>
            Pour exercer vos droits, contactez :
          </p>

          <p style={styles.text}>
            <a href="mailto:support@propard.site" style={styles.link}>
              support@propard.site
            </a>
          </p>

          <p style={styles.text}>
            Propard répond aux demandes dans les délais prévus par le RGPD.
            Lorsque cela est nécessaire pour protéger les données personnelles,
            des informations complémentaires peuvent être demandées afin de
            vérifier raisonnablement l'identité du demandeur.
          </p>

          <p style={styles.text}>
            Vous disposez également du droit d'introduire une réclamation auprès
            de la Commission Nationale de l'Informatique et des Libertés (CNIL).
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>11. Cookies et stockage local</h2>

          <p style={styles.text}>
            Propard n'utilise pas de cookies publicitaires ou de cookies de
            suivi destinés à établir des profils publicitaires.
          </p>

          <p style={styles.text}>
            Le navigateur peut utiliser son stockage local (localStorage) pour
            conserver certaines informations nécessaires au fonctionnement de
            l'application, notamment la session de connexion et certaines
            préférences d'affichage telles que le thème clair ou sombre.
          </p>

          <p style={styles.text}>
            Ces mécanismes ne sont pas utilisés par Propard pour vendre des
            données personnelles ou réaliser du suivi publicitaire.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>12. Décisions automatisées et profilage</h2>

          <p style={styles.text}>
            Propard ne met pas en œuvre de décision automatisée produisant des
            effets juridiques ou des effets significatifs similaires à l'égard
            des utilisateurs.
          </p>

          <p style={styles.text}>
            Propard n'utilise pas les données personnelles des utilisateurs pour
            établir des profils publicitaires.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>13. Sécurité</h2>

          <p style={styles.text}>
            Propard met en œuvre des mesures techniques destinées à protéger les
            données personnelles contre les accès non autorisés, la perte,
            l'altération ou la divulgation non autorisée.
          </p>

          <p style={styles.text}>
            Ces mesures comprennent notamment le hachage des mots de passe,
            l'utilisation du chiffrement pour les messages privés, des contrôles
            d'accès, des mécanismes de limitation des requêtes et différentes
            mesures de sécurité applicative.
          </p>

          <p style={styles.text}>
            Aucune mesure de sécurité ne pouvant garantir un risque nul, Propard
            ne peut garantir une sécurité absolue des données.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>14. Mise à jour de cette politique</h2>

          <p style={styles.text}>
            Cette politique peut être mise à jour lorsque le fonctionnement de
            Propard, les traitements de données, les prestataires utilisés ou
            les exigences légales évoluent.
          </p>

          <p style={styles.text}>
            La date indiquée en haut de cette page correspond à la dernière
            version en vigueur.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>15. Contact</h2>

          <p style={styles.text}>
            Pour toute question concernant cette politique, le traitement de vos
            données personnelles ou l'exercice de vos droits :
          </p>

          <p style={styles.text}>
            <a href="mailto:support@propard.site" style={styles.link}>
              support@propard.site
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