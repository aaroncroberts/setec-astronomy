import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClient,
  getClientById,
  verifyClientSecret,
  getRedirectUris,
  getAllowedScopes,
} from '../../../src/db/clients';
import { D1Mock } from '../helpers/d1-mock';

let db: D1Database;

beforeEach(() => {
  const mock = new D1Mock();
  mock.createTable('clients');
  db = mock.asD1();
});

describe('createClient', () => {
  it('returns client and plaintext secret', async () => {
    const { client, clientSecret } = await createClient(db, {
      name: 'Test App',
      redirectUris: ['https://app.example.com/callback'],
      allowedScopes: ['openid', 'email'],
      isConfidential: true,
    });

    expect(client.id).toBeTruthy();
    expect(client.name).toBe('Test App');
    expect(client.is_confidential).toBe(1);
    expect(typeof clientSecret).toBe('string');
    expect(clientSecret.length).toBeGreaterThan(20);
  });

  it('hashes the client secret — stored hash differs from plaintext', async () => {
    const { client, clientSecret } = await createClient(db, {
      name: 'App',
      redirectUris: ['https://a.example/cb'],
      allowedScopes: ['openid'],
      isConfidential: true,
    });

    expect(client.client_secret).not.toBe(clientSecret);
    expect(client.client_secret).toContain(':'); // PBKDF2 salt:hash format
  });

  it('marks public clients with is_confidential = 0', async () => {
    const { client } = await createClient(db, {
      name: 'Public SPA',
      redirectUris: ['https://spa.example.com/callback'],
      allowedScopes: ['openid'],
      isConfidential: false,
    });
    expect(client.is_confidential).toBe(0);
  });
});

describe('getClientById', () => {
  it('returns the created client by id', async () => {
    const { client } = await createClient(db, {
      name: 'Lookup Test',
      redirectUris: ['https://x.example/cb'],
      allowedScopes: ['openid'],
      isConfidential: true,
    });

    const found = await getClientById(db, client.id);
    expect(found?.id).toBe(client.id);
    expect(found?.name).toBe('Lookup Test');
  });

  it('returns null for unknown client_id', async () => {
    const found = await getClientById(db, 'nonexistent');
    expect(found).toBeNull();
  });
});

describe('verifyClientSecret', () => {
  it('returns true for the correct secret', async () => {
    const { client, clientSecret } = await createClient(db, {
      name: 'Verify Test',
      redirectUris: ['https://v.example/cb'],
      allowedScopes: ['openid'],
      isConfidential: true,
    });

    expect(await verifyClientSecret(client, clientSecret)).toBe(true);
  });

  it('returns false for the wrong secret', async () => {
    const { client } = await createClient(db, {
      name: 'Verify Test 2',
      redirectUris: ['https://v2.example/cb'],
      allowedScopes: ['openid'],
      isConfidential: true,
    });

    expect(await verifyClientSecret(client, 'wrong-secret')).toBe(false);
  });
});

describe('getRedirectUris / getAllowedScopes', () => {
  it('parses redirect_uris from JSON string', async () => {
    const { client } = await createClient(db, {
      name: 'Parse Test',
      redirectUris: ['https://a.com/cb', 'https://b.com/cb'],
      allowedScopes: ['openid', 'email', 'profile'],
      isConfidential: true,
    });

    expect(getRedirectUris(client)).toEqual(['https://a.com/cb', 'https://b.com/cb']);
    expect(getAllowedScopes(client)).toEqual(['openid', 'email', 'profile']);
  });
});
