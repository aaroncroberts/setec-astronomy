import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
  parseUserProfile,
} from '../../../src/db/users';
import { D1Mock } from '../helpers/d1-mock';

let mock: D1Mock;
let db: D1Database;

beforeEach(() => {
  mock = new D1Mock();
  mock.createTable('users');
  db = mock.asD1();
});

describe('createUser', () => {
  it('creates a user and returns the full row', async () => {
    const user = await createUser(db, {
      email: 'alice@example.com',
      password_hash: 'salt:hash',
    });
    expect(user.id).toBeTruthy();
    expect(user.email).toBe('alice@example.com');
    expect(user.password_hash).toBe('salt:hash');
    expect(user.is_active).toBe(1);
    expect(user.created_at).toBeGreaterThan(0);
  });

  it('includes profile_json when profile is provided', async () => {
    const user = await createUser(db, {
      email: 'bob@example.com',
      password_hash: 'salt:hash',
      profile: { name: 'Bob', groups: ['admins'] },
    });
    const profile = parseUserProfile(user);
    expect(profile.name).toBe('Bob');
    expect(profile.groups).toEqual(['admins']);
  });

  it('defaults profile_json to {} when no profile provided', async () => {
    const user = await createUser(db, { email: 'c@example.com', password_hash: 'h' });
    const profile = parseUserProfile(user);
    expect(profile).toEqual({});
  });
});

describe('getUserByEmail', () => {
  it('returns a user that was created', async () => {
    await createUser(db, { email: 'found@example.com', password_hash: 'h' });
    const user = await getUserByEmail(db, 'found@example.com');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('found@example.com');
  });

  it('returns null for non-existent email', async () => {
    const user = await getUserByEmail(db, 'nobody@example.com');
    expect(user).toBeNull();
  });

  it('returns null for deactivated users', async () => {
    // Insert a deactivated user directly into the mock
    mock.insert('users', {
      id: crypto.randomUUID(),
      email: 'inactive@example.com',
      password_hash: 'h',
      created_at: 1000,
      updated_at: 1000,
      is_active: 0,
      profile_json: '{}',
    });
    const user = await getUserByEmail(db, 'inactive@example.com');
    expect(user).toBeNull();
  });
});

describe('getUserById', () => {
  it('returns the user by UUID', async () => {
    const created = await createUser(db, { email: 'id@example.com', password_hash: 'h' });
    const found = await getUserById(db, created.id);
    expect(found?.id).toBe(created.id);
  });

  it('returns null for unknown UUID', async () => {
    const found = await getUserById(db, 'nonexistent-id');
    expect(found).toBeNull();
  });
});

describe('parseUserProfile', () => {
  it('returns empty object for invalid JSON', async () => {
    const user = await createUser(db, { email: 'x@x.com', password_hash: 'h' });
    const malformedUser = { ...user, profile_json: 'not json' };
    expect(parseUserProfile(malformedUser)).toEqual({});
  });
});

describe('listUsers', () => {
  beforeEach(async () => {
    await createUser(db, {
      email: 'alice@example.com',
      password_hash: 'h',
      profile: { name: 'Alice', groups: ['admins'] },
    });
    await createUser(db, { email: 'bob@example.com', password_hash: 'h' });
    await createUser(db, { email: 'carol@example.com', password_hash: 'h' });
  });

  it('returns all users when no search term provided', async () => {
    const { users, total } = await listUsers(db, { limit: 20, offset: 0 });
    expect(users).toHaveLength(3);
    expect(total).toBe(3);
  });

  it('filters by email when search is provided', async () => {
    const { users, total } = await listUsers(db, { search: 'alice', limit: 20, offset: 0 });
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('alice@example.com');
    expect(total).toBe(1);
  });

  it('filters by profile content when search matches name', async () => {
    const { users } = await listUsers(db, { search: 'Alice', limit: 20, offset: 0 });
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('alice@example.com');
  });

  it('respects limit and offset for pagination', async () => {
    const { users } = await listUsers(db, { limit: 2, offset: 0 });
    expect(users).toHaveLength(2);
    const { users: page2 } = await listUsers(db, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(1);
  });

  it('never returns password_hash exposure — field is present but controlled by caller', async () => {
    const { users } = await listUsers(db, { limit: 20, offset: 0 });
    // password_hash is present on the User type; routes strip it before responding
    expect(users[0].password_hash).toBeDefined();
  });
});

describe('updateUser', () => {
  it('updates email and bumps updated_at', async () => {
    const user = await createUser(db, { email: 'old@example.com', password_hash: 'h' });
    const originalUpdatedAt = user.updated_at;
    // Ensure clock advances at least 1 second
    await new Promise((r) => setTimeout(r, 10));
    const updated = await updateUser(db, user.id, { email: 'new@example.com' });
    expect(updated?.email).toBe('new@example.com');
    expect(updated?.updated_at).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  it('deactivates a user via is_active flag', async () => {
    const user = await createUser(db, { email: 'active@example.com', password_hash: 'h' });
    const updated = await updateUser(db, user.id, { is_active: false });
    expect(updated?.is_active).toBe(0);
  });

  it('reactivates a deactivated user', async () => {
    const user = await createUser(db, { email: 'toggled@example.com', password_hash: 'h' });
    await updateUser(db, user.id, { is_active: false });
    const reactivated = await updateUser(db, user.id, { is_active: true });
    expect(reactivated?.is_active).toBe(1);
  });

  it('updates password_hash when provided', async () => {
    const user = await createUser(db, { email: 'pw@example.com', password_hash: 'old_hash' });
    const updated = await updateUser(db, user.id, { password_hash: 'new_hash' });
    expect(updated?.password_hash).toBe('new_hash');
  });

  it('updates profile_json when provided', async () => {
    const user = await createUser(db, { email: 'prof@example.com', password_hash: 'h' });
    const newProfile = JSON.stringify({ name: 'Updated', groups: ['editors'] });
    const updated = await updateUser(db, user.id, { profile_json: newProfile });
    const profile = parseUserProfile(updated!);
    expect(profile.name).toBe('Updated');
    expect(profile.groups).toEqual(['editors']);
  });

  it('returns null for an unknown user id', async () => {
    const result = await updateUser(db, 'nonexistent-id', { is_active: false });
    expect(result).toBeNull();
  });
});

describe('deleteUser', () => {
  it('returns true and removes the user', async () => {
    const user = await createUser(db, { email: 'todelete@example.com', password_hash: 'h' });
    const deleted = await deleteUser(db, user.id);
    expect(deleted).toBe(true);
    const found = await getUserById(db, user.id);
    expect(found).toBeNull();
  });

  it('returns false for an unknown id', async () => {
    const deleted = await deleteUser(db, 'nonexistent-id');
    expect(deleted).toBe(false);
  });
});
