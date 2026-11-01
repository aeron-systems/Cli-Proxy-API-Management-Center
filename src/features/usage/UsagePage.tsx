/**
 * Aeron: usage by app. A pie of who is using the proxy (by share of tokens or
 * requests), a ranked legend, and a table with the exact numbers.
 *
 * The counts come from the proxy itself, per client key, since the proxy
 * version that added /observability/usage/clients was started; there is no
 * history before that.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { clientUsageApi } from '@/services/api/clientUsage';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconChevronDown } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { DonutChart, sliceColor } from './DonutChart';
import {
  USAGE_WINDOWS,
  buildEntries,
  buildSlices,
  formatCompact,
  formatFull,
  formatShare,
  metricValue,
  normalizeClientUsage,
  type ClientUsageRow,
  type ClientUsageSummary,
  type UsageEntry,
  type UsageMetric,
  type UsageWindow,
} from './model';
import styles from './UsagePage.module.scss';

const REFRESH_MS = 30_000;

export function UsagePage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [window, setWindow] = useState<UsageWindow>('24h');
  const [metric, setMetric] = useState<UsageMetric>('tokens');
  const [summary, setSummary] = useState<ClientUsageSummary | null>(null);
  const [error, setError] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Groups (Moon) start open so every user is visible; this holds the ones the viewer closed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setSummary(normalizeClientUsage(await clientUsageApi.fetchRaw(window)));
      setError(false);
    } catch {
      setError(true);
    }
  }, [window]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return undefined;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [connectionStatus, load]);

  useHeaderRefresh(load, connectionStatus === 'connected');

  const otherLabel = t('usage_by_app.other');
  const slices = useMemo(
    () => (summary ? buildSlices(summary.clients, metric, otherLabel) : []),
    [summary, metric, otherLabel]
  );
  const entries = useMemo(
    () => (summary ? buildEntries(summary.clients, metric) : []),
    [summary, metric]
  );
  const total = summary ? metricValue(summary.total, metric) : 0;
  const active = slices.find((slice) => slice.key === activeKey) ?? null;
  const unit = t(metric === 'tokens' ? 'usage_by_app.unit_tokens' : 'usage_by_app.unit_requests');

  const centre = active ? (
    <>
      <span className={styles.centreLabel}>{active.name}</span>
      <span className={styles.centreValue}>{formatShare(active.share)}</span>
      <span className={styles.centreSub}>
        {formatCompact(active.value)} {unit}
      </span>
    </>
  ) : (
    <>
      <span className={styles.centreLabel}>{t('usage_by_app.total')}</span>
      <span className={styles.centreValue}>{formatCompact(total)}</span>
      <span className={styles.centreSub}>{unit}</span>
    </>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('usage_by_app.title')}</h1>
          <p className={styles.subtitle}>{t('usage_by_app.subtitle')}</p>
        </div>
        <div className={styles.controls}>
          <Segmented
            label={t('usage_by_app.metric')}
            value={metric}
            options={[
              { value: 'tokens', label: t('usage_by_app.metric_tokens') },
              { value: 'requests', label: t('usage_by_app.metric_requests') },
            ]}
            onChange={setMetric}
          />
          <Segmented
            label={t('usage_by_app.window')}
            value={window}
            options={USAGE_WINDOWS.map((value) => ({
              value,
              label: t(`usage_by_app.window_${value}`),
            }))}
            onChange={setWindow}
          />
        </div>
      </header>

      {summary === null && !error ? (
        <Skeleton height={340} />
      ) : error && summary === null ? (
        <EmptyState title={t('usage_by_app.error_title')} description={t('usage_by_app.error_hint')} />
      ) : slices.length === 0 ? (
        <EmptyState title={t('usage_by_app.empty_title')} description={t('usage_by_app.empty_hint')} />
      ) : (
        <>
          <section className={styles.card}>
            <DonutChart
              slices={slices}
              activeKey={activeKey}
              onActiveChange={setActiveKey}
              centre={centre}
              ariaLabel={t('usage_by_app.chart_label')}
            />
            <ol className={styles.legend}>
              {slices.map((slice) => {
                const open = slice.children.length > 0 && !collapsed.has(slice.key);
                return (
                  <li key={slice.key} className={styles.legendItem}>
                    <div
                      className={styles.legendRow}
                      data-active={activeKey === slice.key || undefined}
                      data-dimmed={(activeKey !== null && activeKey !== slice.key) || undefined}
                      onMouseEnter={() => setActiveKey(slice.key)}
                      onMouseLeave={() => setActiveKey(null)}
                    >
                      <span className={styles.swatch} style={{ background: sliceColor(slice) }} />
                      <span className={styles.legendName}>
                        {slice.children.length > 0 ? (
                          <button
                            type="button"
                            className={styles.groupToggle}
                            aria-expanded={open}
                            onClick={() => toggleGroup(slice.key)}
                          >
                            <IconChevronDown size={14} className={styles.chevron} data-open={open || undefined} />
                            {slice.name}
                            <span className={styles.legendMeta}>
                              {t('usage_by_app.group_count', { count: slice.children.length })}
                            </span>
                          </button>
                        ) : (
                          slice.name
                        )}
                        {slice.members.length > 0 && (
                          <span className={styles.legendMeta}>
                            {t('usage_by_app.other_count', { count: slice.members.length })}
                          </span>
                        )}
                      </span>
                      <span className={styles.legendValue}>{formatCompact(slice.value)}</span>
                      <span className={styles.legendShare}>{formatShare(slice.share)}</span>
                      <span className={styles.legendBar}>
                        <span
                          className={styles.legendBarFill}
                          style={{
                            width: `${Math.max(slice.share * 100, 0.5)}%`,
                            background: sliceColor(slice),
                          }}
                        />
                      </span>
                    </div>
                    {open && (
                      <ul className={styles.subList}>
                        {slice.children
                          .filter((child) => metricValue(child, metric) > 0)
                          .map((child) => {
                            const value = metricValue(child, metric);
                            return (
                              <li key={child.name} className={styles.subRow}>
                                <span className={styles.subName}>{child.name}</span>
                                <span className={styles.legendValue}>{formatCompact(value)}</span>
                                <span className={styles.subOf}>
                                  {t('usage_by_app.of_group', {
                                    share: formatShare(value / slice.value),
                                    group: slice.name,
                                  })}
                                </span>
                                <span className={styles.legendShare}>{formatShare(value / total)}</span>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={styles.card} data-table>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_by_app.col_app')}</th>
                  <th>{t('usage_by_app.col_pool')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_requests')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_failed')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_input')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_output')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_cache')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_tokens')}</th>
                  <th className={styles.num}>{t('usage_by_app.col_share')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isGroup = entry.children.length > 0;
                  const open = isGroup && !collapsed.has(entry.key);
                  return (
                    <Fragment key={entry.key}>
                      <UsageTableRow
                        row={entry}
                        total={total}
                        metric={metric}
                        pool={isGroup ? '' : entry.pool}
                        label={
                          isGroup ? (
                            <button
                              type="button"
                              className={styles.groupToggle}
                              aria-expanded={open}
                              onClick={() => toggleGroup(entry.key)}
                            >
                              <IconChevronDown size={14} className={styles.chevron} data-open={open || undefined} />
                              {entry.name}
                              <span className={styles.legendMeta}>
                                {t('usage_by_app.group_count', { count: entry.children.length })}
                              </span>
                            </button>
                          ) : (
                            entry.name
                          )
                        }
                        isGroup={isGroup}
                      />
                      {open &&
                        entry.children.map((child) => (
                          <UsageTableRow
                            key={`${entry.key}/${child.name}`}
                            row={child}
                            total={total}
                            metric={metric}
                            pool={child.pool}
                            label={child.name}
                            isChild
                          />
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type UsageTableRowProps = {
  row: ClientUsageRow | UsageEntry;
  total: number;
  metric: UsageMetric;
  pool: string;
  label: ReactNode;
  isGroup?: boolean;
  isChild?: boolean;
};

function UsageTableRow({ row, total, metric, pool, label, isGroup, isChild }: UsageTableRowProps) {
  return (
    <tr data-group={isGroup || undefined} data-child={isChild || undefined}>
      <td className={styles.appName}>{label}</td>
      <td>{pool || '-'}</td>
      <td className={styles.num}>{formatFull(row.requests)}</td>
      <td className={styles.num}>{row.failed ? formatFull(row.failed) : '-'}</td>
      <td className={styles.num}>{formatFull(row.inputTokens)}</td>
      <td className={styles.num}>{formatFull(row.outputTokens)}</td>
      <td className={styles.num}>{formatFull(row.cacheReadTokens + row.cacheCreationTokens)}</td>
      <td className={styles.num}>{formatFull(row.totalTokens)}</td>
      <td className={styles.num}>{formatShare(total > 0 ? metricValue(row, metric) / total : 0)}</td>
    </tr>
  );
}
