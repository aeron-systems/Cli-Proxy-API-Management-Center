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

const row = (name: string, totalTokens: number, requests = 1, group = ''): ClientUsageRow => ({
  name,
  pool: 'shared',
  group,
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

describe('groups', () => {
  test('a group is one slice summing its apps, with the apps as children', () => {
    const slices = buildSlices(
      [row('pratham', 100, 1, 'moon'), row('aryan', 300, 2, 'moon'), row('runway', 250), row('chaksx', 50)],
      'tokens',
      'Other'
    );
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ['Moon', 400],
      ['runway', 250],
      ['chaksx', 50],
    ]);
    expect(slices[0].children.map((c) => c.name)).toEqual(['aryan', 'pratham']);
    expect(slices[0].share).toBeCloseTo(400 / 700, 10);
    expect(slices[1].children).toEqual([]);
  });

  test('a group counts as one entry when folding into Other', () => {
    const apps = Array.from({ length: 7 }, (_, i) => row(`a${i}`, 1000 - i));
    const slices = buildSlices([...apps, row('u1', 3, 1, 'moon'), row('u2', 2, 1, 'moon')], 'tokens', 'Other');
    // 7 apps + 1 Moon entry = 8 entries: all named, no Other.
    expect(slices).toHaveLength(8);
    expect(slices.every((s) => s.slot !== null)).toBe(true);
    expect(slices[7].name).toBe('Moon');
  });

  test('group names from the server are lower-cased', () => {
    const out = normalizeClientUsage({ clients: [{ name: 'a', group: 'Moon', total_tokens: 1 }] });
    expect(out.clients[0].group).toBe('moon');
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
