/**
 * Aeron fork: quota page additions (masking, reset-first order, provider
 * summary, pools).
 */

import { describe, expect, test } from 'bun:test';
import { sortQuotaEntries, type QuotaFileEntry } from '@/features/quota/logic';
import { buildProviderSummary, quotaWindowsFor } from '@/features/quota/summary';
import { maskApiKey, normalizePools, resolveCredentialPool } from '@/features/quota/pools';
import { maskAccountLabel } from '@/utils/quota/identity';
import type { AuthFileItem } from '@/types';

const t = (key: string) => key;

describe('maskAccountLabel', () => {
  test('masks the account and the first domain label', () => {
    expect(maskAccountLabel('claude-theo@luxury.dev.json')).toBe('claude-t•••@l•••.dev.json');
  });

  test('leaves labels without an account unchanged', () => {
    expect(maskAccountLabel('codex-team.json')).toBe('codex-team.json');
  });

  test('masks short local parts to one character', () => {
    expect(maskAccountLabel('ab@x.io')).toBe('a•••@x•••.io');
  });
});

describe('reset_first sort', () => {
  const entry = (name: string, type: QuotaFileEntry['type']): QuotaFileEntry => ({
    file: { name } as AuthFileItem,
    type,
  });
  const entries = [
    entry('claude-a', 'claude'),
    entry('claude-b', 'claude'),
    entry('claude-c', 'claude'),
    entry('codex-a', 'codex'),
    entry('codex-b', 'codex'),
  ];
  const resets: Record<string, number | null> = {
    'claude-a': 300,
    'claude-b': 100,
    'claude-c': null,
    'codex-a': 50,
    'codex-b': 10,
  };

  test('keeps provider groups and orders each by soonest reset, unknown last', () => {
    const sorted = sortQuotaEntries(entries, 'reset_first', (e) => resets[e.file.name]);
    expect(sorted.map((e) => e.file.name)).toEqual([
      'claude-b',
      'claude-a',
      'claude-c',
      'codex-b',
      'codex-a',
    ]);
  });
});

describe('provider summary', () => {
  const claude = (weekly: number, session: number, resetAtMs: number) => ({
    status: 'success',
    windows: [
      { id: 'five_hour', label: '5-hour', usedPercent: session, periodHours: 5, resetAtMs: 9e15 },
      { id: 'seven_day', label: '7-day', usedPercent: weekly, periodHours: 168, resetAtMs },
    ],
  });

  test('adds the weekly window up across credentials', () => {
    const credentials = [
      { key: 'a', loaded: true, windows: quotaWindowsFor('claude', claude(40, 0, 2000), t) },
      { key: 'b', loaded: true, windows: quotaWindowsFor('claude', claude(10, 50, 1000), t) },
      { key: 'c', loaded: false, windows: [] },
    ];
    const summary = buildProviderSummary('claude', credentials, 500);
    expect(summary.headline).toEqual({
      id: 'seven_day',
      label: '7-day',
      remainingSum: 150,
      reporting: 2,
    });
    expect(summary.segments.map((s) => s.remainingPercent)).toEqual([60, 90, null]);
    expect(summary.nextResetAtMs).toBe(1000);
    expect(summary.others.map((line) => line.remainingSum)).toEqual([150]);
    expect(summary.loadedCount).toBe(2);
  });

  test('reads kimi rows as remaining share of the limit', () => {
    const windows = quotaWindowsFor(
      'kimi',
      { status: 'success', rows: [{ id: 'w', label: 'Weekly', used: 25, limit: 100 }] },
      t
    );
    expect(windows[0].remainingPercent).toBe(75);
  });
});

describe('pools', () => {
  test('normalizes a kebab-case list and resolves membership', () => {
    const pools = normalizePools({
      pools: [
        { name: 'shared', 'api-keys': ['sk-shared-0001'], accounts: ['a.json', 'b.json'] },
        { name: 'eric', 'api-keys': ['sk-eric-0002'], accounts: [{ name: 'b.json' }] },
      ],
    });
    expect(pools?.map((pool) => pool.name)).toEqual(['shared', 'eric']);
    expect(resolveCredentialPool({ name: 'b.json' } as AuthFileItem, pools)).toEqual({
      pool: 'eric',
      reserved: true,
    });
    expect(resolveCredentialPool({ name: 'a.json' } as AuthFileItem, pools)).toEqual({
      pool: 'shared',
      reserved: false,
    });
    expect(resolveCredentialPool({ name: 'z.json' } as AuthFileItem, pools)).toBeNull();
  });

  test('a credential field wins and a map payload is accepted', () => {
    const pools = normalizePools({ team: { apiKeys: ['k'], authFiles: ['x.json'] } });
    expect(pools?.[0]).toEqual({ name: 'team', apiKeys: ['k'], accounts: ['x.json'] });
    const file = { name: 'x.json', reserved_for: 'ops' } as unknown as AuthFileItem;
    expect(resolveCredentialPool(file, pools)).toEqual({ pool: 'ops', reserved: true });
  });

  test('servers without pools render nothing', () => {
    expect(normalizePools(null)).toBeNull();
    expect(normalizePools([])).toBeNull();
    expect(resolveCredentialPool({ name: 'x.json' } as AuthFileItem, null)).toBeNull();
  });

  test('api keys are never shown whole', () => {
    expect(maskApiKey('sk-abcdef123456')).toBe('sk-a•••3456');
    expect(maskApiKey('short')).toBe('s•••');
  });
});

describe('reset-first routing strategy', () => {
  test('is kept, not rewritten to round-robin, when the config is parsed', async () => {
    const { parseRoutingStrategy } = await import('../src/hooks/useVisualConfig');
    expect(parseRoutingStrategy('reset-first')).toBe('reset-first');
    expect(parseRoutingStrategy('rf')).toBe('reset-first');
  });
});
