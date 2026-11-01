/**
 * Aeron: how much each client app (pool-client) used the proxy.
 * Served by the Aeron proxy fork only; older servers answer 404.
 */
import { apiClient } from './client';

export const clientUsageApi = {
  fetchRaw: (window: string): Promise<unknown> =>
    apiClient.get<unknown>('/observability/usage/clients', { params: { window } }),
};
