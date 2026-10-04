/**
 * Aeron: credential pools (Aeron proxy fork only).
 *
 * The endpoint was not final when this was written, so the reader tries the
 * config path first and a dedicated route second. Any failure means "this
 * server has no pools", which hides the pool UI rather than raising an error.
 */
import { apiClient } from './client';

const CANDIDATE_PATHS = ['/config/pools', '/pools'];

export const poolsApi = {
  async fetchRaw(): Promise<unknown> {
    for (const path of CANDIDATE_PATHS) {
      try {
        const data = await apiClient.get<unknown>(path);
        if (data !== null && data !== undefined && data !== '') return data;
      } catch {
        // Not supported on this path; try the next one.
      }
    }
    return null;
  },
};
