import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, getUserByEmail, getUserById, parseUserProfile } from '../../../src/db/users';
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
