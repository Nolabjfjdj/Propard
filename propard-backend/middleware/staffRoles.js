const ROLE_LEVELS = Object.freeze({
  user: 0,
  support: 1,
  junior_moderator: 2,
  moderator: 3,
  senior_moderator: 4,
  admin: 5,
  owner: 6
});

function roleLevel(role) {
  return ROLE_LEVELS[role] ?? 0;
}

function requireStaffRole(minimumRole) {
  return (req, res, next) => {
    const currentRole = req.user?.staffRole || 'user';

    if (roleLevel(currentRole) < roleLevel(minimumRole)) {
      return res.status(403).json({
        error: 'Accès réservé au personnel autorisé.'
      });
    }

    req.staffRole = currentRole;
    return next();
  };
}

function canManageRole(actorRole, targetRole) {
  return roleLevel(actorRole) > roleLevel(targetRole);
}

module.exports = {
  ROLE_LEVELS,
  roleLevel,
  requireStaffRole,
  canManageRole
};
