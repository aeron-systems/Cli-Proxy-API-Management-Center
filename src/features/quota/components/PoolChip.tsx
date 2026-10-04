import { useTranslation } from 'react-i18next';
import type { CredentialPoolInfo } from '../pools';
import styles from './Pools.module.scss';

/** "Reserved for <pool>" or "Shared pool"; renders nothing without pool data. */
export function PoolChip({ info }: { info: CredentialPoolInfo | null }) {
  const { t } = useTranslation();
  if (!info) return null;
  return (
    <span className={info.reserved ? `${styles.chip} ${styles.chipReserved}` : styles.chip}>
      {info.reserved
        ? t('quota_management.pool_reserved_for', { pool: info.pool })
        : t('quota_management.pool_shared')}
    </span>
  );
}
