import { createStore, useStore } from './store';
import type { GamePoint } from './projection';

export type Tab = 'map' | 'quests' | 'flea' | 'ammo' | 'hideout' | 'barters';

export interface MapFocus {
  mapId: string;
  points: GamePoint[];
  /** Changes on every request so asking for the same spot twice still moves the map. */
  nonce: number;
  /** Highlights the matching quest's markers when set. */
  questId?: string;
}

interface NavState {
  tab: Tab;
  focus: MapFocus | null;
}

// The tab is restored on launch; focus requests are one-off, so drop any saved one.
export const navStore = createStore<NavState>('tarkovz.nav.v1', { tab: 'map', focus: null });
if (navStore.get().focus) navStore.set((s) => ({ ...s, focus: null }));
export const useNav = () => useStore(navStore);

export function setTab(tab: Tab) {
  navStore.set((s) => ({ ...s, tab }));
}

let nonce = 0;
export function showOnMap(focus: Omit<MapFocus, 'nonce'>) {
  navStore.set({ tab: 'map', focus: { ...focus, nonce: ++nonce } });
}
