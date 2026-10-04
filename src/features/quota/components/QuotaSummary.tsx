/**
 * Summary row: one card per provider, adding each window up across that
 * provider's credentials ("7-day limit 409% of 500%"), one bar segment per
 * credential, and the soonest reset.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import { formatInstantShort, formatRelativeInstant } from '@/utils/quota';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { QUOTA_TAB_ORDER } from '../constants';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import type { QuotaProviderType } from '../providers/types';
import { buildProviderSummary, quotaWindowsFor, type ProviderSummary } from '../summary';
import {
  QUOTA_PROGRESS_HIGH_THRESHOLD,
  QUOTA_PROGRESS_MEDIUM_THRESHOLD,
} from './QuotaMeter';
import styles from './QuotaSummary.module.scss';

export type QuotaSummaryProps = {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  onSelectProvider: (provider: QuotaProviderType) => void;
};

const levelClass = (percent: number | null): string => {
  if (percent === null) return styles.segmentEmpty;
  if (percent >= QUOTA_PROGRESS_HIGH_THRESHOLD) return styles.segmentHigh;
  if (percent >= QUOTA_PROGRESS_MEDIUM_THRESHOLD) return styles.segmentMedium;
  return styles.segmentLow;
};

const formatSum = (value: number) => `${Math.round(value)}%`;

export function QuotaSummary({
  entries,
  quotaFor,
  resolvedTheme,
  onSelectProvider,
}: QuotaSummaryProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();

  const summaries = useMemo<ProviderSummary[]>(() => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      String(t(key, params ?? {}));
    return QUOTA_TAB_ORDER.map((provider) => {
      const credentials = entries
        .filter((entry) => entry.type === provider)
        .map((entry) => {
          const quota = quotaFor(entry);
          return {
            key: getQuotaCacheKey(entry.file),
            loaded: quota?.status === 'success',
            windows: quotaWindowsFor(provider, quota, translate),
          };
        });
      return buildProviderSummary(provider, credentials, now);
    }).filter((summary) => summary.credentialCount > 0);
  }, [entries, quotaFor, now, t]);

  if (summaries.length === 0) return null;

  return (
    <div className={styles.row} data-reveal>
      {summaries.map((summary) => {
        const iconSrc = getAuthFileIcon(summary.provider, resolvedTheme);
        const typeLabel = getTypeLabel(t, summary.provider);
        const headline = summary.headline;
        return (
          <button
            type="button"
            key={summary.provider}
            className={styles.card}
            onClick={() => onSelectProvider(summary.provider)}
            title={t('quota_management.summary_show_provider', { provider: typeLabel })}
          >
            <span className={styles.head}>
              <span
                className={styles.iconWrap}
                style={
                  isThemeSurfaceIconProvider(summary.provider)
                    ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
                    : undefined
                }
              >
                {iconSrc ? (
                  <img src={iconSrc} alt="" className={styles.icon} />
                ) : (
                  <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span className={styles.name}>{typeLabel}</span>
              <span className={styles.count}>
                {t('quota_management.summary_credentials', { count: summary.credentialCount })}
              </span>
            </span>

            <span className={styles.windowLabel}>
              {headline ? headline.label : t('quota_management.summary_not_loaded')}
            </span>
            <span className={styles.total}>
              <span className={styles.totalValue}>
                {headline ? formatSum(headline.remainingSum) : '--'}
              </span>
              <span className={styles.totalOf}>
                {t('quota_management.summary_of', {
                  total: `${(headline?.reporting ?? summary.credentialCount) * 100}%`,
                })}
              </span>
            </span>

            <span className={styles.segments} aria-hidden="true">
              {summary.segments.map((segment) => (
                <span key={segment.key} className={styles.segment}>
                  <span
                    className={`${styles.segmentFill} ${levelClass(segment.remainingPercent)}`}
                    style={{ width: `${segment.remainingPercent ?? 0}%` }}
                  />
                </span>
              ))}
            </span>

            <span className={styles.reset}>
              {summary.nextResetAtMs !== null ? (
                <>
                  <span className={styles.resetRelative}>
                    {formatRelativeInstant(summary.nextResetAtMs, now, i18n.resolvedLanguage)}
                  </span>
                  <span className={styles.resetAbsolute}>
                    {formatInstantShort(summary.nextResetAtMs)}
                  </span>
                </>
              ) : (
                <span className={styles.resetAbsolute}>
                  {t('quota_management.summary_loaded', {
                    loaded: summary.loadedCount,
                    total: summary.credentialCount,
                  })}
                </span>
              )}
            </span>

            {summary.others.length > 0 && (
              <span className={styles.others}>
                {summary.others.slice(0, 3).map((line) => (
                  <span key={line.id} className={styles.otherLine}>
                    <span className={styles.otherLabel}>{line.label}</span>
                    <span className={styles.otherValue}>
                      {formatSum(line.remainingSum)}
                      <span className={styles.totalOf}>
                        {t('quota_management.summary_of', { total: `${line.reporting * 100}%` })}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
