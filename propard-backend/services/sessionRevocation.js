function revokeAllSessions(user) {
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  user.activeSessions = [];
  return user;
}

module.exports = { revokeAllSessions };
