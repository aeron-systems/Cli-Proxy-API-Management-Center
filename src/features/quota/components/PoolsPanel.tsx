/**
 * Aeron: each client API key with its pool and the accounts in it.
 * API keys are always masked; account names follow the page's Show emails toggle.
 */
import { useTranslation } from 'react-i18next';
import { maskAccountLabel } from '@/utils/quota/identity';
import { maskApiKey, SHARED_POOL, type CredentialPool } from '../pools';
import styles from './Pools.module.scss';

export type PoolsPanelProps = {
  pools: CredentialPool[];
  showEmails: boolean;
};

export function PoolsPanel({ pools, showEmails }: PoolsPanelProps) {
  const { t } = useTranslation();
  const account = (value: string) => (showEmails ? value : maskAccountLabel(value));

  return (
    <section className={styles.panel} aria-labelledby="quota-pools-title">
      <h2 id="quota-pools-title" className={styles.title}>
        {t('quota_management.pools_title')}
        <span className={styles.titleCount}>{pools.length}</span>
      </h2>
      <div className={styles.table} role="table">
        <div className={styles.headRow} role="row">
          <span role="columnheader">{t('quota_management.pools_col_pool')}</span>
          <span role="columnheader">{t('quota_management.pools_col_keys')}</span>
          <span role="columnheader">{t('quota_management.pools_col_accounts')}</span>
        </div>
        {pools.map((pool) => (
          <div key={pool.name} className={styles.row} role="row">
            <span role="cell" className={styles.poolName}>
              {pool.name}
              {pool.name.toLowerCase() === SHARED_POOL && (
                <span className={styles.chip}>{t('quota_management.pool_shared')}</span>
              )}
            </span>
            <span role="cell" className={styles.list}>
              {pool.apiKeys.length === 0 ? (
                <span className={styles.none}>{t('quota_management.pools_none')}</span>
              ) : (
                pool.apiKeys.map((key) => (
                  <code key={key} className={styles.mono}>
                    {maskApiKey(key)}
                  </code>
                ))
              )}
            </span>
            <span role="cell" className={styles.list}>
              {pool.accounts.length === 0 ? (
                <span className={styles.none}>{t('quota_management.pools_none')}</span>
              ) : (
                pool.accounts.map((name) => (
                  <span key={name} className={styles.mono}>
                    {account(name)}
                  </span>
                ))
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
