/**
 * Aeron fork: the AI cost page's data shaping. The rule that matters is that a
 * row with no price never reads as $0.
 */

import { describe, expect, test } from 'bun:test';
import { costBasis, formatDollars, normalizeCost } from '@/features/usage/costModel';

describe('normalizeCost', () => {
  test('keeps a null price as null, not zero', () => {
    const cost = normalizeCost({
      total: { name: 'total', dollars: null, total_tokens: 5, unpriced_tokens: 5 },
      models: [
        { name: 'unknown', dollars: null, total_tokens: 5, unpriced_tokens: 5 },
        { name: 'failed-only', total_tokens: 0 },
        { name: 'claude-opus-5-5', dollars: 0, total_tokens: 0 },
      ],
      unpriced_models: ['unknown'],
      prices: { as_of: '2026-11-07' },
    });
    expect(cost.total.dollars).toBeNull();
    expect(cost.models[0].dollars).toBeNull();
    expect(cost.models[1].dollars).toBeNull();
    expect(cost.models[2].dollars).toBe(0);
    expect(cost.unpricedModels).toEqual(['unknown']);
    expect(cost.pricesAsOf).toBe('2026-11-07');
  });

  test('survives an empty or odd answer', () => {
    const cost = normalizeCost(null);
    expect(cost.clients).toEqual([]);
    expect(cost.models).toEqual([]);
    expect(cost.warnings).toEqual([]);
    expect(normalizeCost({ clients: [{ dollars: 1 }, 'x'] }).clients).toEqual([]);
  });
});

describe('costBasis', () => {
  test('names where the dollars come from', () => {
    expect(costBasis({ realDollars: 0, estimatedDollars: 2 })).toBe('estimate');
    expect(costBasis({ realDollars: 2, estimatedDollars: 0 })).toBe('real');
    expect(costBasis({ realDollars: 1, estimatedDollars: 1 })).toBe('mixed');
    expect(costBasis({ realDollars: 0, estimatedDollars: 0 })).toBe('none');
  });
});

describe('formatDollars', () => {
  test('no price stays null and small amounts stay visible', () => {
    expect(formatDollars(null)).toBeNull();
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(0.001)).toBe('<$0.01');
    expect(formatDollars(1234.5)).toBe('$1,234.50');
  });
});
