import { createStore, useStore } from './store';
import type { GameMode } from '../api/types';
import type { PricingMode } from './pricing';

export interface Settings {
  gameMode: GameMode;
  /** Which side you're playing this raid; drives extract availability. */
  side: 'pmc' | 'scav';
  /** PMC faction, to hide BEAR- or USEC-only tasks. */
  faction: 'BEAR' | 'USEC';
  playerLevel: number;
  barterPricing: PricingMode;
  intelCenter3: boolean;
  hideoutManagement: number;
  /** Your loyalty level per trader id; barters above it are hidden. */
  traderLevels: Record<string, number>;
  /** Read the game's log files for quest and raid events. Off until you turn it on. */
  gameLog: {
    enabled: boolean;
    /** Logs folder; null finds it automatically. */
    folder: string | null;
    autoQuests: boolean;
    autoMap: boolean;
    autoTimer: boolean;
  };
}

export const settingsStore = createStore<Settings>('tarkovz.settings.v1', {
  gameMode: 'regular',
  side: 'pmc',
  faction: 'USEC',
  playerLevel: 15,
  barterPricing: 'flea',
  intelCenter3: false,
  hideoutManagement: 0,
  traderLevels: {},
  gameLog: { enabled: false, folder: null, autoQuests: true, autoMap: true, autoTimer: true },
});

export const useSettings = () => useStore(settingsStore);

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}
