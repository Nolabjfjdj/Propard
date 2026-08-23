// Envoie les signalements vers un salon Discord privé via webhook, au lieu
// d'un email. Avantages : gratuit, passe par HTTPS (port 443, jamais
// bloqué par Render contrairement aux ports SMTP), et l'URL du webhook ne
// quitte jamais le serveur — elle est lue depuis une variable d'env, donc
// invisible et impossible à usurper depuis le frontend.

const DISCORD_WEBHOOK_URL = process.env.DISCORD_REPORT_WEBHOOK_URL;

// Envoie un signalement. Ne stocke JAMAIS rien en base de données — le
// seul endroit où le contenu signalé existe est ce message Discord. Le
// contenu fourni est déjà en clair : le serveur ne peut techniquement pas
// déchiffrer un message E2E lui-même, c'est le client du signaleur qui
// l'a déchiffré avant l'envoi.
async function sendReportNotification({ reporter, reportedUser, messageId, content, reason, messageCreatedAt }) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error('Service de signalement non configuré (DISCORD_REPORT_WEBHOOK_URL manquant).');
  }

  // Limite Discord : 4096 caractères max pour une description d'embed.
  const truncatedContent = content.length > 3800
    ? content.slice(0, 3800) + '… (tronqué)'
    : content;

  const embed = {
    title: `🚩 Signalement — ${reportedUser?.username || 'utilisateur inconnu'}`,
    description: truncatedContent,
    color: 0xE74C3C,
    fields: [
      { name: 'Signalé par', value: `${reporter?.username || '?'} (\`${reporter?._id || '?'}\`)` },
      { name: 'Utilisateur signalé', value: `${reportedUser?.username || '?'} (\`${reportedUser?._id || '?'}\`)` },
      { name: 'Message ID', value: `\`${messageId}\``, inline: true },
      {
        name: 'Date du message',
        value: messageCreatedAt ? new Date(messageCreatedAt).toLocaleString('fr-FR') : '?',
        inline: true
      },
      { name: 'Motif', value: reason || '(non précisé)' }
    ],
    timestamp: new Date().toISOString()
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Discord webhook error (${res.status}): ${errBody}`);
  }
}

module.exports = { sendReportNotification };
