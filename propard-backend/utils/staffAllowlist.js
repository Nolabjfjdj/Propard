// Liste blanche des staff, stockée dans les variables d'environnement (hors base de données).
// Un staffRole écrit en base ne donne AUCUN pouvoir si l'_id n'est pas listé ici.
//
// Variables (ObjectId séparés par des virgules) :
//   STAFF_OWNER_IDS, STAFF_ADMIN_IDS, STAFF_SENIOR_MODERATOR_IDS,
//   STAFF_MODERATOR_IDS, STAFF_JUNIOR_MODERATOR_IDS, STAFF_SUPPORT_IDS
//
// Rôle effectif = le plus bas entre le rôle en base et le rôle maximum autorisé par les variables.
// Pas listé nulle part => 'user'.

const { ROLE_LEVELS, roleLevel } = require('../middleware/staffRoles');

const ENV_BY_ROLE = Object.freeze({
  owner: 'STAFF_OWNER_IDS',
  admin: 'STAFF_ADMIN_IDS',
  senior_moderator: 'STAFF_SENIOR_MODERATOR_IDS',
  moderator: 'STAFF_MODERATOR_IDS',
  junior_moderator: 'STAFF_JUNIOR_MODERATOR_IDS',
  support: 'STAFF_SUPPORT_IDS'
});

function parseList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map(id => id.trim().toLowerCase())
      .filter(id => /^[a-f0-9]{24}$/.test(id))
  );
}

const allowlists = Object.fromEntries(
  Object.entries(ENV_BY_ROLE).map(([role, envName]) => [role, parseList(process.env[envName])])
);

if (Object.values(allowlists).every(set => set.size === 0)) {
  console.warn('⚠️ Aucune variable STAFF_*_IDS définie : plus personne n\'a de rôle staff.');
}

function maxAllowedRole(userId) {
  const id = String(userId || '').toLowerCase();
  let best = 'user';

  for (const [role, set] of Object.entries(allowlists)) {
    if (set.has(id) && roleLevel(role) > roleLevel(best)) {
      best = role;
    }
  }

  return best;
}

function effectiveStaffRole(userId, dbRole) {
  const stored = Object.prototype.hasOwnProperty.call(ROLE_LEVELS, dbRole) ? dbRole : 'user';
  const allowed = maxAllowedRole(userId);

  return roleLevel(stored) <= roleLevel(allowed) ? stored : allowed;
}

module.exports = { effectiveStaffRole, maxAllowedRole };
