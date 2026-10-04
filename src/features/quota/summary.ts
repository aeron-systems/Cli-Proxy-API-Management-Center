/**
 * Per-provider quota summary (the card row above the credential list).
 *
 * Each provider state keeps its windows in its own shape. This reads them into
 * one flat list of "how much is left, when does it come back" so a provider
 * card can add the same window up across every credential: five Claude
 * accounts with a weekly window each read as "409% of 500%".
 *
 * Pure and React-free: labels are resolved through the `t` passed in.
 */

import type { QuotaProviderType } from './providers/types';

export interface QuotaWindowSnapshot {
  id: string;
  label: string;
  /** 0–100, or null when the provider reported no usage figure. */
  remainingPercent: number | null;
  resetAtMs: number | null;
  periodHours: number | null;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const fromUsed = (used: unknown): number | null => {
  const value = finite(used);
  return value === null ? null : clampPercent(100 - value);
};

interface LabelledWindow {
  id?: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, unknown>;
  usedPercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

const labelOf = (window: LabelledWindow, t: Translate): string =>
  window.labelKey ? t(window.labelKey, window.labelParams ?? {}) : (window.label ?? '');

/** Every window on one loaded credential; empty unless the state is `success`. */
export function quotaWindowsFor(
  provider: QuotaProviderType,
  quota: unknown,
  t: Translate
): QuotaWindowSnapshot[] {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return [];

  if (provider === 'claude' || provider === 'codex') {
    const windows = (quota as { windows?: LabelledWindow[] }).windows ?? [];
    return windows.map((window, index) => ({
      id: window.id || `window-${index}`,
      label: labelOf(window, t),
      remainingPercent: fromUsed(window.usedPercent),
      resetAtMs: finite(window.resetAtMs),
      periodHours: finite(window.periodHours),
    }));
  }

  if (provider === 'devin') {
    const windows =
      (
        quota as {
          windows?: {
            id: string;
            remainingPercent: number | null;
            resetAtMs: number | null;
            periodHours: number;
          }[];
        }
      ).windows ?? [];
    return windows.map((window) => {
      const remaining = finite(window.remainingPercent);
      return {
        id: window.id,
        label: t(`devin_quota.${window.id}`),
        remainingPercent: remaining === null ? null : clampPercent(remaining),
        resetAtMs: finite(window.resetAtMs),
        periodHours: finite(window.periodHours),
      };
    });
  }

  if (provider === 'antigravity') {
    const groups =
      (
        quota as {
          groups?: {
            buckets?: (LabelledWindow & { remainingFraction?: number })[];
          }[];
        }
      ).groups ?? [];
    return groups
      .flatMap((group) => group.buckets ?? [])
      .map((bucket, index) => {
        const fraction = finite(bucket.remainingFraction);
        return {
          id: bucket.id || `bucket-${index}`,
          label: bucket.label ?? '',
          remainingPercent: fraction === null ? null : clampPercent(fraction * 100),
          resetAtMs: finite(bucket.resetAtMs),
          periodHours: finite(bucket.periodHours),
        };
      });
  }

  if (provider === 'kimi') {
    const rows =
      (quota as { rows?: (LabelledWindow & { used?: number; limit?: number })[] }).rows ?? [];
    return rows.map((row, index) => {
      const used = finite(row.used);
      const limit = finite(row.limit);
      return {
        id: row.id || `row-${index}`,
        label: labelOf(row, t),
        remainingPercent:
          used === null || limit === null || limit <= 0
            ? null
            : clampPercent(((limit - used) / limit) * 100),
        resetAtMs: finite(row.resetAtMs),
        periodHours: finite(row.periodHours),
      };
    });
  }

  if (provider === 'xai') {
    const billing = (
      quota as {
        billing?: {
          periodType?: string;
          usedPercent?: number | null;
          resetAtMs?: number | null;
          periodHours?: number | null;
        } | null;
      }
    ).billing;
    if (!billing) return [];
    return [
      {
        id: `xai:${billing.periodType ?? 'period'}`,
        label: t(
          billing.periodType === 'monthly'
            ? 'quota_management.summary_monthly_limit'
            : 'quota_management.summary_weekly_limit'
        ),
        remainingPercent: fromUsed(billing.usedPercent),
        resetAtMs: finite(billing.resetAtMs),
        periodHours: finite(billing.periodHours),
      },
    ];
  }

  if (provider === 'meta') {
    const windows =
      (
        quota as {
          data?: {
            windows?: {
              id: string;
              usedPercent: number | null;
              resetAt?: number;
              durationMinutes?: number;
            }[];
          };
        }
      ).data?.windows ?? [];
    return windows.map((window) => {
      const resetAt = finite(window.resetAt);
      const minutes = finite(window.durationMinutes);
      return {
        id: window.id,
        label:
          window.id === 'window' && minutes
            ? t('meta_quota.window_duration', { minutes })
            : t(`meta_quota.${window.id}`),
        remainingPercent: fromUsed(window.usedPercent),
        resetAtMs: resetAt === null ? null : resetAt * 1000,
        periodHours: minutes === null ? (window.id === 'weekly' ? 168 : null) : minutes / 60,
      };
    });
  }

  return [];
}

export interface SummarySegment {
  key: string;
  /** Remaining percent on the headline window; null when not loaded or unknown. */
  remainingPercent: number | null;
}

export interface SummaryLine {
  id: string;
  label: string;
  remainingSum: number;
  /** Credentials that reported this window: the "of N×100%" denominator. */
  reporting: number;
}

export interface ProviderSummary {
  provider: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  headline: SummaryLine | null;
  /** One per credential, in list order, for the headline window. */
  segments: SummarySegment[];
  /** Soonest future reset of the headline window across credentials. */
  nextResetAtMs: number | null;
  /** The provider's other windows, summed the same way. */
  others: SummaryLine[];
}

export interface SummaryCredential {
  key: string;
  windows: QuotaWindowSnapshot[];
  loaded: boolean;
}

/**
 * Add each window up across credentials and pick the headline: the longest
 * window (the weekly cap is what runs out), and among equally long ones the
 * tightest, since that is the one that will stop requests first.
 */
export function buildProviderSummary(
  provider: QuotaProviderType,
  credentials: SummaryCredential[],
  nowMs: number
): ProviderSummary {
  const lines = new Map<string, SummaryLine & { periodHours: number; order: number }>();
  credentials.forEach((credential) => {
    credential.windows.forEach((window) => {
      if (window.remainingPercent === null) return;
      const line = lines.get(window.id) ?? {
        id: window.id,
        label: window.label,
        remainingSum: 0,
        reporting: 0,
        periodHours: window.periodHours ?? 0,
        order: lines.size,
      };
      line.remainingSum += window.remainingPercent;
      line.reporting += 1;
      line.periodHours = Math.max(line.periodHours, window.periodHours ?? 0);
      lines.set(window.id, line);
    });
  });

  const ranked = [...lines.values()].sort(
    (a, b) =>
      b.periodHours - a.periodHours ||
      a.remainingSum / a.reporting - b.remainingSum / b.reporting ||
      a.order - b.order
  );
  const headline = ranked[0] ?? null;

  let nextResetAtMs: number | null = null;
  const segments = credentials.map((credential) => {
    const window = headline
      ? credential.windows.find((candidate) => candidate.id === headline.id)
      : undefined;
    const resetAt = window?.resetAtMs ?? null;
    if (resetAt !== null && resetAt > nowMs && (nextResetAtMs === null || resetAt < nextResetAtMs)) {
      nextResetAtMs = resetAt;
    }
    return { key: credential.key, remainingPercent: window?.remainingPercent ?? null };
  });

  const strip = (line: SummaryLine): SummaryLine => ({
    id: line.id,
    label: line.label,
    remainingSum: line.remainingSum,
    reporting: line.reporting,
  });

  return {
    provider,
    credentialCount: credentials.length,
    loadedCount: credentials.filter((credential) => credential.loaded).length,
    headline: headline ? strip(headline) : null,
    segments,
    nextResetAtMs,
    others: [...lines.values()]
      .filter((line) => line.id !== headline?.id)
      .sort((a, b) => a.order - b.order)
      .map(strip),
  };
}
