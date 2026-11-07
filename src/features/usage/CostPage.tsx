/**
 * Aeron: AI cost per app and per model, worked out by the proxy from its own
 * token counts and price table. Traffic on subscription pools is an estimate at
 * list price; the page says so and each row names its basis.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clientUsageApi } from '@/services/api/clientUsage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { costBasis, formatDollars, normalizeCost, type CostRow, type CostSummary } from './costModel';
import { USAGE_WINDOWS, formatCompact, formatFull, type UsageWindow } from './model';
import { Segmented } from './UsagePage';
import styles from './UsagePage.module.scss';

const REFRESH_MS = 30_000;

export function CostPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [window, setWindow] = useState<UsageWindow>('24h');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(normalizeCost(await clientUsageApi.fetchCostRaw(window)));
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

  const total = summary?.total;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('cost.title')}</h1>
          <p className={styles.subtitle}>{t('cost.subtitle')}</p>
        </div>
        <div className={styles.controls}>
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

      <p className={styles.notice}>{t('cost.estimate_notice')}</p>

      {summary === null && !error ? (
        <Skeleton height={340} />
      ) : summary === null || !total ? (
        <EmptyState title={t('cost.error_title')} description={t('cost.error_hint')} />
      ) : summary.clients.length === 0 ? (
        <EmptyState title={t('cost.empty_title')} description={t('cost.empty_hint')} />
      ) : (
        <>
          {summary.warnings.map((warning) => (
            <p key={warning} className={styles.notice}>
              {warning}
            </p>
          ))}
          {summary.unpricedModels.length > 0 && (
            <p className={styles.notice}>
              {t('cost.unpriced_notice', {
                models: summary.unpricedModels.join(', '),
                tokens: formatFull(total.unpricedTokens),
              })}
            </p>
          )}

          <section className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('cost.total')}</span>
              <span className={styles.statValue}>{formatDollars(total.dollars) ?? t('cost.no_price')}</span>
              {summary.pricesAsOf && (
                <span className={styles.statSub}>{t('cost.prices_as_of', { date: summary.pricesAsOf })}</span>
              )}
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('cost.estimated')}</span>
              <span className={styles.statValue}>{formatDollars(total.estimatedDollars)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('cost.real')}</span>
              <span className={styles.statValue}>{formatDollars(total.realDollars)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('cost.tokens')}</span>
              <span className={styles.statValue}>{formatCompact(total.totalTokens)}</span>
              <span className={styles.statSub}>
                {t('cost.requests', { count: formatFull(total.requests) })}
              </span>
            </div>
          </section>

          <CostTable title={t('cost.by_client')} nameColumn={t('cost.col_app')} rows={summary.clients} showPool />
          <CostTable title={t('cost.by_model')} nameColumn={t('cost.col_model')} rows={summary.models} />
        </>
      )}
    </div>
  );
}

type CostTableProps = {
  title: string;
  nameColumn: string;
  rows: CostRow[];
  showPool?: boolean;
};

function CostTable({ title, nameColumn, rows, showPool }: CostTableProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.card} data-table>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{nameColumn}</th>
            {showPool && <th>{t('cost.col_pool')}</th>}
            <th className={styles.num}>{t('cost.col_requests')}</th>
            <th className={styles.num}>{t('cost.col_tokens')}</th>
            <th className={styles.num}>{t('cost.col_cost')}</th>
            <th>{t('cost.col_basis')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const basis = costBasis(row);
            const dollars = formatDollars(row.dollars);
            const partial = dollars !== null && row.unpricedTokens > 0;
            return (
              <tr key={row.name}>
                <td className={styles.appName}>{row.name}</td>
                {showPool && <td>{row.pool || '-'}</td>}
                <td className={styles.num}>{formatFull(row.requests)}</td>
                <td className={styles.num}>{formatFull(row.totalTokens)}</td>
                <td
                  className={styles.num}
                  title={
                    dollars === null
                      ? t('cost.no_price_hint')
                      : partial
                        ? t('cost.partial_hint', { tokens: formatFull(row.unpricedTokens) })
                        : undefined
                  }
                >
                  {dollars === null ? t('cost.no_price') : partial ? `${dollars}+` : dollars}
                </td>
                <td>
                  {basis === 'none'
                    ? '-'
                    : t(basis === 'estimate' ? 'cost.basis_estimate' : basis === 'real' ? 'cost.basis_real' : 'cost.basis_mixed')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
