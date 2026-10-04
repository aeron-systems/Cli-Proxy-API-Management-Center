/**
 * Aeron: credential pools.
 *
 * The Aeron proxy fork binds each client API key to a pool of subscription
 * accounts. An account is either reserved for one pool or sits in the shared
 * pool. The management API for this was still being written when this view
 * was built, so the reader below accepts the likely spellings (kebab, snake and
 * camel case; a list or a name-keyed map) and everything renders only when the
 * backend actually returns pool data. Older or upstream servers show nothing.
 *
 * Pure and React-free.
 */

import type { AuthFileItem } from '@/types';

export const SHARED_POOL = 'shared';

export interface CredentialPool {
  name: string;
  /** Client API keys bound to the pool. Secrets: mask before display. */
  apiKeys: string[];
  /** Credential identifiers (auth file name or account email). */
  accounts: string[];
}

const pick = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toStringList = (value: unknown, objectKeys: string[]): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      const record = asRecord(item);
      const picked = record ? pick(record, objectKeys) : undefined;
      return typeof picked === 'string' ? picked.trim() : '';
    })
    .filter(Boolean);
};

const API_KEY_FIELDS = ['api-keys', 'api_keys', 'apiKeys', 'keys', 'clients', 'client-keys'];
const ACCOUNT_FIELDS = [
  'accounts',
  'auth-files',
  'auth_files',
  'authFiles',
  'credentials',
  'members',
];
const ACCOUNT_OBJECT_KEYS = ['name', 'file', 'auth-file', 'auth_file', 'id', 'email'];
const API_KEY_OBJECT_KEYS = ['key', 'api-key', 'api_key', 'apiKey', 'value'];

const normalizePool = (name: string, raw: unknown): CredentialPool | null => {
  const record = asRecord(raw) ?? {};
  const resolvedName = String(pick(record, ['name', 'id', 'pool']) ?? name).trim();
  if (!resolvedName) return null;
  return {
    name: resolvedName,
    apiKeys: toStringList(pick(record, API_KEY_FIELDS), API_KEY_OBJECT_KEYS),
    accounts: toStringList(pick(record, ACCOUNT_FIELDS), ACCOUNT_OBJECT_KEYS),
  };
};

/** Pools from a management response, or null when the server has none. */
export function normalizePools(payload: unknown): CredentialPool[] | null {
  const wrapper = asRecord(payload);
  const body = wrapper && 'pools' in wrapper ? wrapper.pools : payload;
  let pools: (CredentialPool | null)[] = [];
  if (Array.isArray(body)) {
    pools = body.map((item, index) => normalizePool(`pool-${index + 1}`, item));
  } else {
    const map = asRecord(body);
    if (!map) return null;
    pools = Object.entries(map).map(([name, value]) => normalizePool(name, value));
  }
  const result = pools.filter((pool): pool is CredentialPool => pool !== null);
  return result.length > 0 ? result : null;
}

const FILE_POOL_FIELDS = [
  'pool',
  'pool-name',
  'pool_name',
  'poolName',
  'reserved-for',
  'reserved_for',
  'reservedFor',
  'reserved-pool',
  'reserved_pool',
  'reservedPool',
];

export interface CredentialPoolInfo {
  pool: string;
  reserved: boolean;
}

/**
 * Which pool a credential belongs to: the credential's own field when the
 * server sends one, otherwise the pool whose account list names it. A
 * reserved pool wins over the shared pool if both list the same account.
 */
export function resolveCredentialPool(
  file: AuthFileItem,
  pools: CredentialPool[] | null
): CredentialPoolInfo | null {
  const own = pick(file as Record<string, unknown>, FILE_POOL_FIELDS);
  if (typeof own === 'string' && own.trim()) {
    const pool = own.trim();
    return { pool, reserved: pool.toLowerCase() !== SHARED_POOL };
  }
  if (!pools) return null;
  const ids = [file.name, file.email].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  const matches = pools.filter((pool) => pool.accounts.some((account) => ids.includes(account)));
  if (matches.length === 0) return null;
  const reserved = matches.find((pool) => pool.name.toLowerCase() !== SHARED_POOL);
  const pool = (reserved ?? matches[0]).name;
  return { pool, reserved: pool.toLowerCase() !== SHARED_POOL };
}

/** `sk-a•••9f2c`: enough to tell keys apart, never the key. */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 1)}•••`;
  return `${key.slice(0, 4)}•••${key.slice(-4)}`;
}
