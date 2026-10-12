/**
 * The board's two tabs (ROADMAP 79): 'Statistik' and 'Feedback'. The chosen tab lives in the URL hash
 * (#feedback, #statistik) and in sessionStorage, which holds only the tab name (no secret). Storage access
 * is wrapped: a blocked or missing storage just forgets the tab.
 */
export const BOARD_TABS = ['stats', 'feedback'] as const;
export type BoardTab = (typeof BOARD_TABS)[number];

export const TAB_STORAGE_KEY = 'cannstatt-cruiser:boardTab';

const HASHES: Record<BoardTab, string> = { stats: '#statistik', feedback: '#feedback' };

export function tabHash(tab: BoardTab): string {
  return HASHES[tab];
}

export function tabFromHash(hash: string): BoardTab | null {
  return BOARD_TABS.find((tab) => HASHES[tab] === hash) ?? null;
}

const isTab = (v: string | null): v is BoardTab => BOARD_TABS.includes(v as BoardTab);

/** The hash wins (a shared or bookmarked link), then the tab of this browser session, then Statistik. */
export function initialTab(hash: string, stored: string | null): BoardTab {
  return tabFromHash(hash) ?? (isTab(stored) ? stored : 'stats');
}

export function readStoredTab(storage: Pick<Storage, 'getItem'> | null): string | null {
  try {
    return storage?.getItem(TAB_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeTab(storage: Pick<Storage, 'setItem'> | null, tab: BoardTab): void {
  try {
    storage?.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Storage blocked: the hash still remembers the tab.
  }
}
