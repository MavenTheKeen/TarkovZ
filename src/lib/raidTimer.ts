import { useEffect, useState } from 'react';
import { createStore, useStore } from './store';

// One raid timer shared by every screen, kept across restarts so an app
// relaunch mid-raid doesn't lose it.
export interface RaidTimer {
  mapId: string;
  mapName: string;
  startedAt: number;
  /** Raid length in minutes. */
  minutes: number;
}

export const raidTimerStore = createStore<RaidTimer | null>('tarkovz.raidTimer.v1', null);

export const useRaidTimer = () => useStore(raidTimerStore);

export function startRaid(timer: Omit<RaidTimer, 'startedAt'>) {
  raidTimerStore.set({ ...timer, startedAt: Date.now() });
}

export function stopRaid() {
  raidTimerStore.set(null);
}

/** Seconds left in the raid (negative once it has run out), ticking every second. */
export function useSecondsLeft(timer: RaidTimer | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  return Math.round(timer.minutes * 60 - (now - timer.startedAt) / 1000);
}

export function formatClock(seconds: number): string {
  const s = Math.abs(seconds);
  return `${seconds < 0 ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
