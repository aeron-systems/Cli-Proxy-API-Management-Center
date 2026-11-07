/**
 * Aeron: AI cost per app and model. Pure data shaping for the cost page.
 *
 * `dollars` is null when a row has tokens and none could be priced. That means
 * "no price" and must never be shown as $0.
 */

export type CostBasis = 'estimate' | 'real' | 'mixed' | 'none';

export interface CostRow {
  name: string;
  pool: string;
  group: string;
  requests: number;
  totalTokens: number;
  dollars: number | null;
  realDollars: number;
  estimatedDollars: number;
  unpricedTokens: number;
}

export interface CostSummary {
  window: string;
  total: CostRow;
  clients: CostRow[];
  models: CostRow[];
  unpricedModels: string[];
  pricesAsOf: string;
  warnings: string[];
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeRow(raw: Record<string, unknown>): CostRow {
  const dollars = raw.dollars;
  return {
    name: str(raw.name),
    pool: str(raw.pool),
    group: str(raw.group),
    requests: num(raw.requests),
    totalTokens: num(raw.total_tokens),
    // Anything but a real number is "no price". Number(null) would be a silent 0.
    dollars: typeof dollars === 'number' && Number.isFinite(dollars) ? dollars : null,
    realDollars: num(raw.real_dollars),
    estimatedDollars: num(raw.estimated_dollars),
    unpricedTokens: num(raw.unpriced_tokens),
  };
}

function normalizeRows(raw: unknown): CostRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map(normalizeRow).filter((row) => row.name !== '');
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map(str).filter((value) => value !== '') : [];

export function normalizeCost(raw: unknown): CostSummary {
  const root = isRecord(raw) ? raw : {};
  const prices = isRecord(root.prices) ? root.prices : {};
  return {
    window: str(root.window),
    total: normalizeRow(isRecord(root.total) ? root.total : {}),
    clients: normalizeRows(root.clients),
    models: normalizeRows(root.models),
    unpricedModels: strings(root.unpriced_models),
    pricesAsOf: str(prices.as_of),
    warnings: strings(root.warnings),
  };
}

export function costBasis(row: Pick<CostRow, 'realDollars' | 'estimatedDollars'>): CostBasis {
  if (row.realDollars > 0 && row.estimatedDollars > 0) return 'mixed';
  if (row.realDollars > 0) return 'real';
  if (row.estimatedDollars > 0) return 'estimate';
  return 'none';
}

const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' });

/** Dollars to show, or null for "no price". Tiny amounts do not round down to $0.00. */
export function formatDollars(value: number | null): string | null {
  if (value === null) return null;
  if (value > 0 && value < 0.01) return '<$0.01';
  return usd.format(value);
}
