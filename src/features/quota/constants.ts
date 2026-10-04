import type { QuotaProviderType } from './providers/types';

/** tab 顺序 = 旧页五分区的纵向顺序，'全部' tab 下卡片也按此分组排列。 */
export const QUOTA_TAB_ORDER: readonly QuotaProviderType[] = [
  'claude',
  'antigravity',
  'codex',
  'xai',
  'kimi',
  'devin',
  'meta',
];

export type QuotaTabId = 'all' | QuotaProviderType;

/** 页级分页固定 20/页，同时把「刷新全部」的上游并发限制在 20。 */
export const QUOTA_PAGE_SIZE = 20;

/**
 * 卡片排序：默认 = provider 分组序；soonest = 最快恢复优先。
 * reset_first = provider 分组内按最快恢复排序（与代理的 reset-first 路由一致）。
 */
export const QUOTA_SORT_MODES = ['reset_first', 'default', 'soonest'] as const;

export type QuotaSortMode = (typeof QUOTA_SORT_MODES)[number];

/** 与 useRevealGroup 的 GROUP_MAX_TOTAL 一致：卡片级联总预算 360ms。 */
export const CARD_ENTRANCE_BUDGET_MS = 360;

/** Initial sort when the session has no stored preference. */
export const QUOTA_DEFAULT_SORT_MODE: QuotaSortMode = 'reset_first';
