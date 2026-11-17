function disconnectUserSessionSockets(io, connectedUsers, userId, sessionJti, event = 'sessionExpired', payload = { message: 'Session expirée. Reconnecte-toi.' }) {
  const userKey = userId == null ? '' : userId.toString();
  if (!userKey || typeof sessionJti !== 'string' || !sessionJti.trim()) return 0;

  const userSockets = connectedUsers.get(userKey);
  if (!userSockets || userSockets.size === 0) return 0;

  let disconnected = 0;

  for (const socketId of [...userSockets]) {
    const socket = io?.sockets?.sockets?.get(socketId);
    if (!socket || socket.sessionJti !== sessionJti) continue;

    socket.emit(event, payload);
    socket.disconnect(true);
    disconnected += 1;
  }

  return disconnected;
}

module.exports = { disconnectUserSessionSockets };
