import type { AuthFileItem } from '@/types';
import { normalizeRecentRequestAuthIndex } from '@/utils/recentRequests';
import { isDevinFile } from './validators';

const QUOTA_IDENTITY_SEPARATOR = '\0';

/**
 * Cache identity is filename-based for every existing provider. Devin alone can
 * expose multiple credential identities from one physical file, distinguished
 * by auth_index.
 */
export function getQuotaCacheKey(file: AuthFileItem): string {
  if (!isDevinFile(file)) return file.name;
  const authIndex = normalizeRecentRequestAuthIndex(file.authIndex);
  return `${file.name}${QUOTA_IDENTITY_SEPARATOR}${authIndex ?? ''}`;
}

/** Disambiguate same-name Devin cards without ever falling back to account (a secret). */
export function getQuotaDisplayName(file: AuthFileItem): string {
  if (!isDevinFile(file)) return file.name;
  const identity = file.email?.trim() || normalizeRecentRequestAuthIndex(file.authIndex);
  return identity ? `${file.name} · ${identity}` : file.name;
}

/** Resolve a cache identity back to the physical filename used by file mutations. */
export function getQuotaCacheFileName(key: string): string {
  const separatorIndex = key.indexOf(QUOTA_IDENTITY_SEPARATOR);
  return separatorIndex === -1 ? key : key.slice(0, separatorIndex);
}

const MASK = '•••';

const maskSegment = (value: string, keep: number): string =>
  value.length <= keep ? `${value.slice(0, 1)}${MASK}` : `${value.slice(0, keep)}${MASK}`;

/**
 * Hide the account part of a credential label while keeping it recognisable:
 * `claude-theo@luxury.dev.json` becomes `claude-t•••@l•••.dev.json`. Labels
 * without an `@` are returned unchanged; they carry no account identity.
 */
export function maskAccountLabel(label: string): string {
  return label.replace(/([^\s@·]+)@([^\s@·]+)/g, (_match, local: string, domain: string) => {
    const keep = Math.min(8, Math.max(1, Math.floor(local.length / 2)));
    const [head, ...rest] = domain.split('.');
    const maskedDomain = [maskSegment(head, 1), ...rest].join('.');
    return `${maskSegment(local, keep)}@${maskedDomain}`;
  });
}
