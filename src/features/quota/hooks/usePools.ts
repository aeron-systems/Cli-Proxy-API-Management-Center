import { useEffect, useState } from 'react';
import { poolsApi } from '@/services/api/pools';
import { useAuthStore } from '@/stores';
import { normalizePools, type CredentialPool } from '../pools';

/** Pools for the current connection; null while loading or when unsupported. */
export function usePools(): CredentialPool[] | null {
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [pools, setPools] = useState<CredentialPool[] | null>(null);

  useEffect(() => {
    if (connectionStatus !== 'connected') return undefined;
    let cancelled = false;
    void poolsApi.fetchRaw().then((raw) => {
      if (!cancelled) setPools(normalizePools(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [connectionStatus]);

  return connectionStatus === 'connected' ? pools : null;
}
