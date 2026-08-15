import { create } from 'zustand';

const SITE_STORAGE_KEY = 'selected-site-id';

interface SiteState {
  selectedSiteId: string | null;
  setSelectedSiteId: (siteId: string | null) => void;
}

function getInitialSiteId(): string | null {
  try {
    const stored = localStorage.getItem(SITE_STORAGE_KEY);
    return stored?.trim() ? stored : null;
  } catch {
    return null;
  }
}

export const useSiteStore = create<SiteState>((set) => ({
  selectedSiteId: getInitialSiteId(),
  setSelectedSiteId: (siteId) => {
    try {
      if (siteId) {
        localStorage.setItem(SITE_STORAGE_KEY, siteId);
      } else {
        localStorage.removeItem(SITE_STORAGE_KEY);
      }
    } catch {}
    set({ selectedSiteId: siteId });
  },
}));
