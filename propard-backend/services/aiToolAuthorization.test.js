const test = require('node:test');
const assert = require('node:assert/strict');
const { validateToolCall } = require('./aiToolAuthorization');

const tool = name => ({ function: { name } });
const call = (name, args) => ({
  function: {
    name,
    arguments: JSON.stringify(args)
  }
});

test('rejects a valid tool that was not selected for the request', () => {
  const result = validateToolCall(call('list_my_friends', {}), [tool('get_my_profile')]);
  assert.deepEqual(result, {
    ok: false,
    error: 'Outil non autorisé pour cette demande.'
  });
});

test('accepts a selected tool with its exact argument shape', () => {
  const result = validateToolCall(
    call('prepare_private_message', { recipient: 'ami', content: 'Salut' }),
    [tool('prepare_private_message')]
  );
  assert.deepEqual(result, {
    ok: true,
    name: 'prepare_private_message',
    args: { recipient: 'ami', content: 'Salut' }
  });
});

test('accepts selected tools that require no arguments', () => {
  assert.deepEqual(
    validateToolCall(call('get_my_profile', {}), [tool('get_my_profile')]),
    { ok: true, name: 'get_my_profile', args: {} }
  );
});

test('rejects unexpected and missing arguments', () => {
  const selected = [tool('prepare_group_message')];
  assert.equal(
    validateToolCall(call('prepare_group_message', { groupId: 'g', content: 'x', userId: 'other' }), selected).ok,
    false
  );
  assert.equal(
    validateToolCall(call('prepare_group_message', { groupId: 'g' }), selected).ok,
    false
  );
});

test('rejects malformed arguments and unknown tool names', () => {
  const malformed = { function: { name: 'get_my_profile', arguments: '{' } };
  assert.equal(validateToolCall(malformed, [tool('get_my_profile')]).ok, false);
  assert.equal(validateToolCall(call('admin_delete_user', {}), [tool('admin_delete_user')]).ok, false);
});
