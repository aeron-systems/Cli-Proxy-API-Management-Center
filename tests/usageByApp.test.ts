/**
 * Aeron fork: usage-by-app pie (grouping, shares, formatting).
 */

import { describe, expect, test } from 'bun:test';
import {
  buildSlices,
  formatShare,
  normalizeClientUsage,
  type ClientUsageRow,
} from '@/features/usage/model';

const row = (name: string, totalTokens: number, requests = 1): ClientUsageRow => ({
  name,
  pool: 'shared',
  requests,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens,
});

describe('normalizeClientUsage', () => {
  test('survives junk and drops unnamed rows', () => {
    expect(normalizeClientUsage(null).clients).toEqual([]);
    const out = normalizeClientUsage({
      clients: [{ name: 't3', total_tokens: 10, requests: 2 }, { name: '' }, 5, { name: 'x', total_tokens: -4 }],
    });
    expect(out.clients.map((c) => [c.name, c.totalTokens, c.requests])).toEqual([
      ['t3', 10, 2],
      ['x', 0, 0],
    ]);
  });
});

describe('buildSlices', () => {
  test('shares add up and the biggest app gets slot 1', () => {
    const slices = buildSlices([row('t3', 100), row('hydron', 300)], 'tokens', 'Other');
    expect(slices.map((s) => [s.name, s.slot, s.share])).toEqual([
      ['hydron', 1, 0.75],
      ['t3', 2, 0.25],
    ]);
  });

  test('apps with nothing to show are left out, and no traffic means no slices', () => {
    expect(buildSlices([row('idle', 0)], 'tokens', 'Other')).toEqual([]);
    expect(buildSlices([row('idle', 0, 4), row('busy', 9, 1)], 'requests', 'Other').map((s) => s.name)).toEqual([
      'idle',
      'busy',
    ]);
  });

  test('folds from the ninth app up into one grey Other slice', () => {
    const eight = Array.from({ length: 8 }, (_, i) => row(`a${i}`, 100 - i));
    expect(buildSlices(eight, 'tokens', 'Other').every((s) => s.slot !== null)).toBe(true);

    const nine = [...eight, row('a8', 50)];
    const slices = buildSlices(nine, 'tokens', 'Other');
    expect(slices).toHaveLength(8);
    const other = slices[7];
    expect(other.slot).toBeNull();
    expect(other.members.map((m) => m.name)).toEqual(['a7', 'a8']);
    expect(other.value).toBe(93 + 50);
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('formatShare', () => {
  test('rounds sensibly', () => {
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(0.0004)).toBe('<0.1%');
    expect(formatShare(0.423)).toBe('42.3%');
    expect(formatShare(0.5)).toBe('50%');
    expect(formatShare(1)).toBe('100%');
  });
});
