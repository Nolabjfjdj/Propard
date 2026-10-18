const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_LEVELS, roleLevel, requireStaffRole, canManageRole } = require('../middleware/staffRoles');

test('staff roles have a strict increasing hierarchy', () => {
  const roles = Object.keys(ROLE_LEVELS);
  assert.deepEqual(roles, [
    'user',
    'support',
    'junior_moderator',
    'moderator',
    'senior_moderator',
    'admin',
    'owner'
  ]);

  for (let index = 1; index < roles.length; index += 1) {
    assert.ok(roleLevel(roles[index]) > roleLevel(roles[index - 1]));
  }
});

test('unknown or missing roles have no staff privileges', () => {
  assert.equal(roleLevel(undefined), -1);
  assert.equal(roleLevel('not_a_role'), -1);
  assert.equal(canManageRole('support', 'not_a_role'), false);
  assert.equal(canManageRole('not_a_role', 'user'), false);
  assert.equal(canManageRole('user', 'support'), false);
});

test('a staff member cannot manage a role at the same or higher level', () => {
  assert.equal(canManageRole('moderator', 'moderator'), false);
  assert.equal(canManageRole('moderator', 'senior_moderator'), false);
  assert.equal(canManageRole('senior_moderator', 'moderator'), true);
  assert.equal(canManageRole('owner', 'admin'), true);
  assert.equal(canManageRole('owner', 'owner'), false);
  assert.equal(canManageRole('admin', 'owner'), false);
  assert.equal(canManageRole('owner', 'user'), true);
});

test('role middleware denies ordinary users and allows qualifying staff', () => {
  const middleware = requireStaffRole('moderator');
  const deniedResponse = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let deniedNextCalled = false;

  middleware({ user: { staffRole: 'support' } }, deniedResponse, () => {
    deniedNextCalled = true;
  });

  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(deniedNextCalled, false);

  const invalidMinimumResponse = {
    statusCode: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let invalidMinimumNextCalled = false;
  requireStaffRole('not_a_role')({ user: { staffRole: 'owner' } }, invalidMinimumResponse, () => {
    invalidMinimumNextCalled = true;
  });
  assert.equal(invalidMinimumResponse.statusCode, 403);
  assert.equal(invalidMinimumNextCalled, false);

  const allowedResponse = {};
  let allowedNextCalled = false;
  const allowedRequest = { user: { staffRole: 'moderator' } };

  middleware(allowedRequest, allowedResponse, () => {
    allowedNextCalled = true;
  });

  assert.equal(allowedNextCalled, true);
  assert.equal(allowedRequest.staffRole, 'moderator');
});
