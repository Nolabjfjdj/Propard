function createCallStateManager({
  groupCalls,
  privateCalls,
  emitToUser
}) {
  const getPrivateCallKey = (a, b) =>
    [a.toString(), b.toString()].sort().join(':');

  const emitGroupCall = (call, event, payload) => {
    for (const memberId of call.members) {
      emitToUser(memberId, event, payload);
    }
  };

  const endPrivateCall = (userA, userB) => {
    const key = getPrivateCallKey(userA, userB);
    const call = privateCalls.get(key);

    if (!call) return false;

    privateCalls.delete(key);

    emitToUser(call.callerId, 'callEnded');
    emitToUser(call.receiverId, 'callEnded');

    return true;
  };

  const markPrivateCallAnswered = (callerId, receiverId) => {
    const key = getPrivateCallKey(callerId, receiverId);
    const call = privateCalls.get(key);

    if (!call) return false;

    call.answered = true;
    return true;
  };

  const getPendingPrivateCall = userId => {
    const userKey = userId.toString();

    for (const call of privateCalls.values()) {
      if (
        call.receiverId === userKey &&
        !call.answered
      ) {
        return call;
      }
    }

    return null;
  };

  const endGroupCall = groupId => {
    const key = groupId.toString();
    const call = groupCalls.get(key);

    if (!call) return false;

    emitGroupCall(
      call,
      'groupCallEnded',
      {
        groupId: key,
        callId: call.callId
      }
    );

    for (const userId of call.pendingInvites || []) {
      emitToUser(
        userId,
        'groupCallEnded',
        {
          groupId: key,
          callId: call.callId
        }
      );
    }

    groupCalls.delete(key);
    return true;
  };

  const removeUserFromGroupCall = (groupId, userId) => {
    const key = groupId.toString();
    const userKey = userId.toString();
    const call = groupCalls.get(key);

    if (!call) return false;

    if (call.pendingInvites?.has(userKey)) {
      call.pendingInvites.delete(userKey);
      return true;
    }

    if (!call.members.has(userKey)) return false;

    if (call.callerId === userKey) {
      return endGroupCall(key);
    }

    call.members.delete(userKey);

    emitGroupCall(
      call,
      'groupCallMemberLeft',
      {
        groupId: key,
        callId: call.callId,
        userId: userKey
      }
    );

    emitToUser(
      userKey,
      'groupCallEnded',
      {
        groupId: key,
        callId: call.callId
      }
    );

    if (call.members.size === 0) {
      groupCalls.delete(key);
    }

    return true;
  };

  const getPendingGroupCalls = userId => {
    const userKey = userId.toString();
    const pending = [];

    for (const call of groupCalls.values()) {
      if (call.pendingInvites?.has(userKey)) {
        pending.push(call);
      }
    }

    return pending;
  };

  const acceptGroupCall = (groupId, userId) => {
    const key = groupId.toString();
    const userKey = userId.toString();
    const call = groupCalls.get(key);

    if (!call) return false;

    call.pendingInvites?.delete(userKey);
    call.members.add(userKey);
    return true;
  };

  const removeUserFromAllCalls = userId => {
    const userKey = userId.toString();
    let changed = false;

    for (const [key, call] of groupCalls.entries()) {
      if (call.callerId === userKey) {
        changed = endGroupCall(key) || changed;
        continue;
      }

      if (call.members.has(userKey)) {
        changed = removeUserFromGroupCall(key, userKey) || changed;
      }
    }

    for (const [key, call] of privateCalls.entries()) {
      if (call.callerId === userKey) {
        privateCalls.delete(key);
        emitToUser(call.receiverId, 'callEnded');
        changed = true;
        continue;
      }

      if (
        call.receiverId === userKey &&
        call.answered
      ) {
        privateCalls.delete(key);
        emitToUser(call.callerId, 'callEnded');
        changed = true;
      }
    }

    return changed;
  };

  return {
    getPrivateCallKey,
    endPrivateCall,
    markPrivateCallAnswered,
    getPendingPrivateCall,
    endGroupCall,
    removeUserFromGroupCall,
    getPendingGroupCalls,
    acceptGroupCall,
    removeUserFromAllCalls
  };
}

module.exports = { createCallStateManager };
