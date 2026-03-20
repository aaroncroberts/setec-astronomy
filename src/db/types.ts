/**
 * Domain types for D1-persisted entities.
 * These match the column layout in the migration SQL files.
 */

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: number; // Unix timestamp (seconds)
  updated_at: number;
  is_active: 0 | 1;
  profile_json: string; // JSON string: { name?, groups?, ... }
}

export interface UserProfile {
  name?: string;
  groups?: string[];
  [key: string]: unknown;
}

export interface Client {
  id: string; // client_id
  client_secret: string; // hashed
  name: string;
  redirect_uris: string; // JSON array string
  allowed_scopes: string; // JSON array string
  created_at: number;
  updated_at: number;
  is_confidential: 0 | 1;
}

export interface RefreshToken {
  id: string;
  client_id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  revoked: 0 | 1;
}
