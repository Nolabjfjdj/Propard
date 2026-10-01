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

    groupCalls.delete(key);
    return true;
  };

  const removeUserFromGroupCall = (groupId, userId) => {
    const key = groupId.toString();
    const userKey = userId.toString();
    const call = groupCalls.get(key);

    if (!call || !call.members.has(userKey)) return false;

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

  const removeUserFromAllCalls = userId => {
    const userKey = userId.toString();
    let changed = false;

    for (const [key, call] of groupCalls.entries()) {
      if (!call.members.has(userKey)) continue;
      changed = removeUserFromGroupCall(key, userKey) || changed;
    }

    for (const [key, call] of privateCalls.entries()) {
      if (
        call.callerId !== userKey &&
        call.receiverId !== userKey
      ) {
        continue;
      }

      const otherId =
        call.callerId === userKey
          ? call.receiverId
          : call.callerId;

      privateCalls.delete(key);
      emitToUser(otherId, 'callEnded');
      changed = true;
    }

    return changed;
  };

  return {
    getPrivateCallKey,
    endPrivateCall,
    endGroupCall,
    removeUserFromGroupCall,
    removeUserFromAllCalls
  };
}

module.exports = { createCallStateManager };
