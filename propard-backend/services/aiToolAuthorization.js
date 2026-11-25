const TOOL_ARGUMENT_KEYS = Object.freeze({
  get_my_profile: [],
  list_my_friends: [],
  list_my_groups: [],
  prepare_private_message: ['recipient', 'content'],
  prepare_group_message: ['groupId', 'content'],
  request_last_private_message: ['recipient', 'direction'],
  request_last_group_message: ['groupId']
});

function validateToolCall(toolCall, selectedTools) {
  const name = toolCall?.function?.name;
  const selectedNames = new Set(
    (Array.isArray(selectedTools) ? selectedTools : [])
      .map(tool => tool?.function?.name)
      .filter(value => typeof value === 'string')
  );

  if (typeof name !== 'string' || !selectedNames.has(name)) {
    return { ok: false, error: 'Outil non autorisé pour cette demande.' };
  }

  let args;
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return { ok: false, error: 'Arguments invalides.' };
  }

  const allowedKeys = TOOL_ARGUMENT_KEYS[name];
  if (
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args) ||
    !allowedKeys ||
    Object.keys(args).some(key => !allowedKeys.includes(key)) ||
    allowedKeys.some(key => !Object.prototype.hasOwnProperty.call(args, key))
  ) {
    return { ok: false, error: 'Arguments invalides.' };
  }

  return { ok: true, name, args };
}

module.exports = { validateToolCall };
