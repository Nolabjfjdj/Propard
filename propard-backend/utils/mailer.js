const nodemailer = require('nodemailer');

const REPORT_EMAIL_TO = process.env.REPORT_EMAIL_TO || 'propard@outlook.fr';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️ SMTP_USER / SMTP_PASS non configurés — les signalements ne pourront pas être envoyés par email.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // STARTTLS
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

// Envoie un signalement par email. Ne stocke JAMAIS rien en base de
// données — le seul endroit où le contenu signalé existe est cet email.
// Le contenu fourni est déjà en clair : le serveur ne peut techniquement
// pas déchiffrer un message E2E lui-même, c'est le client du signaleur
// qui l'a déchiffré avant l'envoi.
async function sendReportEmail({ reporter, reportedUser, messageId, content, reason, messageCreatedAt }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('Service email non configuré (SMTP_USER/SMTP_PASS manquants).');
  }

  const subject = `🚩 Signalement Propard — ${reportedUser?.username || 'utilisateur inconnu'}`;

  const text = [
    `Signalé par : ${reporter?.username || '?'} (${reporter?._id || '?'})`,
    `Utilisateur signalé : ${reportedUser?.username || '?'} (${reportedUser?._id || '?'})`,
    `Message ID : ${messageId}`,
    `Date du message : ${messageCreatedAt ? new Date(messageCreatedAt).toLocaleString('fr-FR') : '?'}`,
    reason ? `Motif fourni : ${reason}` : 'Motif : (non précisé)',
    '',
    '--- Contenu du message signalé (déchiffré côté client du signaleur) ---',
    content,
    '-------------------------------------------------------------------------'
  ].join('\n');

  await t.sendMail({
    from: process.env.SMTP_USER,
    to: REPORT_EMAIL_TO,
    subject,
    text
  });
}

module.exports = { sendReportEmail };
