const DISCORD_WEBHOOK_URL = process.env.DISCORD_REPORT_WEBHOOK_URL;

async function sendReportNotification({
  reporter,
  reportedUser,
  messageId,
  content,
  reason,
  messageCreatedAt
}) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      'Service de signalement non configuré (DISCORD_REPORT_WEBHOOK_URL manquant).'
    );
  }

  const truncatedContent = content.length > 3800
    ? content.slice(0, 3800) + '… (tronqué)'
    : content;

  const embed = {
    title: `🚩 Signalement — ${reportedUser?.username || 'utilisateur inconnu'}`,
    description: truncatedContent,
    color: 0xE74C3C,
    fields: [
      {
        name: 'Signalé par',
        value: `${reporter?.username || '?'} (\`${reporter?._id || '?'}\`)`
      },
      {
        name: 'Utilisateur signalé',
        value: `${reportedUser?.username || '?'} (\`${reportedUser?._id || '?'}\`)`
      },
      {
        name: 'Message ID',
        value: `\`${messageId}\``,
        inline: true
      },
      {
        name: 'Date du message',
        value: messageCreatedAt
          ? new Date(messageCreatedAt).toLocaleString('fr-FR')
          : '?',
        inline: true
      },
      {
        name: 'Motif',
        value: reason || '(non précisé)'
      }
    ],
    timestamp: new Date().toISOString()
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      embeds: [embed]
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');

    console.error('❌ Échec webhook Discord');
    console.error('Status:', res.status);
    console.error('Content-Type:', res.headers.get('content-type'));
    console.error('Body:', errBody.slice(0, 1000));

    throw new Error(
      `Discord webhook error (${res.status})`
    );
  }

  console.log('✅ Signalement envoyé à Discord');
}

module.exports = { sendReportNotification };