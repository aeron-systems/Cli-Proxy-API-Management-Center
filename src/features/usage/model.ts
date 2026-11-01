/**
 * Aeron: usage by client app. Pure data shaping for the pie chart and table.
 */

export type UsageWindow = '1h' | '24h' | '7d' | '30d' | 'all';
export type UsageMetric = 'tokens' | 'requests';

export const USAGE_WINDOWS: UsageWindow[] = ['1h', '24h', '7d', '30d', 'all'];

/** Slots 1-7 of the categorical palette; the eighth place is always "Other". */
export const MAX_NAMED_SLICES = 7;

export interface ClientUsageRow {
  name: string;
  pool: string;
  /** Heading the proxy files this app under (for example "moon"), or "". */
  group: string;
  requests: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
}

export interface ClientUsageSummary {
  window: string;
  total: Counts;
  clients: ClientUsageRow[];
}

type Counts = Omit<ClientUsageRow, 'name' | 'pool' | 'group'>;

/**
 * One entry of the pie: a single app, or a whole group (Moon) with its apps as
 * children. A group's numbers are the sum of its children.
 */
export interface UsageEntry extends ClientUsageRow {
  key: string;
  children: ClientUsageRow[];
}

export interface UsageSlice {
  key: string;
  name: string;
  value: number;
  /** 0..1 of the chart's total for the chosen metric. */
  share: number;
  /** 1-based palette slot, or null for the grey "Other" slice. */
  slot: number | null;
  /** The apps (or groups) folded into an "Other" slice (empty for a named slice). */
  members: UsageEntry[];
  /** The apps inside a group slice such as Moon, biggest first (empty otherwise). */
  children: ClientUsageRow[];
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeCounts(raw: Record<string, unknown>): Counts {
  return {
    requests: num(raw.requests),
    failed: num(raw.failed),
    inputTokens: num(raw.input_tokens),
    outputTokens: num(raw.output_tokens),
    cacheReadTokens: num(raw.cache_read_tokens),
    cacheCreationTokens: num(raw.cache_creation_tokens),
    totalTokens: num(raw.total_tokens),
  };
}

export function normalizeClientUsage(raw: unknown): ClientUsageSummary {
  const root = isRecord(raw) ? raw : {};
  const clients: ClientUsageRow[] = [];
  if (Array.isArray(root.clients)) {
    for (const item of root.clients) {
      if (!isRecord(item)) continue;
      const name = str(item.name);
      if (!name) continue;
      clients.push({
        name,
        pool: str(item.pool),
        group: str(item.group).toLowerCase(),
        ...normalizeCounts(item),
      });
    }
  }
  return {
    window: str(root.window),
    total: normalizeCounts(isRecord(root.total) ? root.total : {}),
    clients,
  };
}

export function metricValue(row: Pick<ClientUsageRow, 'requests' | 'totalTokens'>, metric: UsageMetric) {
  return metric === 'tokens' ? row.totalTokens : row.requests;
}

export const groupLabel = (group: string): string => group.charAt(0).toUpperCase() + group.slice(1);

function sumCounts(rows: Counts[]): Counts {
  const total: Counts = {
    requests: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };
  for (const row of rows) {
    total.requests += row.requests;
    total.failed += row.failed;
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
    total.cacheReadTokens += row.cacheReadTokens;
    total.cacheCreationTokens += row.cacheCreationTokens;
    total.totalTokens += row.totalTokens;
  }
  return total;
}

const byMetric = (metric: UsageMetric) => (a: ClientUsageRow, b: ClientUsageRow) =>
  metricValue(b, metric) - metricValue(a, metric) || a.name.localeCompare(b.name);

/** Apps with a group are folded into one entry per group; the rest stand alone. */
export function buildEntries(clients: ClientUsageRow[], metric: UsageMetric): UsageEntry[] {
  const entries: UsageEntry[] = [];
  const groups = new Map<string, ClientUsageRow[]>();
  for (const row of clients) {
    if (!row.group) {
      entries.push({ ...row, key: row.name, children: [] });
      continue;
    }
    const members = groups.get(row.group);
    if (members) members.push(row);
    else groups.set(row.group, [row]);
  }
  for (const [group, rows] of groups) {
    entries.push({
      key: `group:${group}`,
      name: groupLabel(group),
      pool: '',
      group,
      ...sumCounts(rows),
      children: [...rows].sort(byMetric(metric)),
    });
  }
  return entries.sort(byMetric(metric));
}

/**
 * The pie: the biggest entries get their own slice, in palette order (largest
 * first); everything past the seventh folds into one grey "Other" slice.
 * Entries with nothing for this metric are left out.
 */
export function buildSlices(
  clients: ClientUsageRow[],
  metric: UsageMetric,
  otherLabel: string
): UsageSlice[] {
  const rows = buildEntries(clients, metric).filter((row) => metricValue(row, metric) > 0);
  const total = rows.reduce((sum, row) => sum + metricValue(row, metric), 0);
  if (total <= 0) return [];

  // An "Other" slice of one entry would just be that entry, so only fold from 9 up.
  const named = rows.length > MAX_NAMED_SLICES + 1 ? rows.slice(0, MAX_NAMED_SLICES) : rows;
  const rest = rows.slice(named.length);

  const slices: UsageSlice[] = named.map((row, index) => ({
    key: row.key,
    name: row.name,
    value: metricValue(row, metric),
    share: metricValue(row, metric) / total,
    slot: index + 1,
    members: [],
    children: row.children,
  }));
  if (rest.length > 0) {
    const value = rest.reduce((sum, row) => sum + metricValue(row, metric), 0);
    slices.push({
      key: '__other__',
      name: otherLabel,
      value,
      share: value / total,
      slot: null,
      members: rest,
      children: [],
    });
  }
  return slices;
}

/** "42.3%", "<0.1%" for slivers, "0%" for nothing. */
export function formatShare(share: number): string {
  if (!(share > 0)) return '0%';
  const pct = share * 100;
  if (pct < 0.1) return '<0.1%';
  return `${pct >= 99.95 ? 100 : pct.toFixed(1).replace(/\.0$/, '')}%`;
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

export const formatCompact = (value: number): string => compact.format(value);
export const formatFull = (value: number): string => full.format(value);
