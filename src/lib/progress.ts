import { createStore, useStore, type Store } from './store';
import type { GameMode } from '../api/types';

// Quest progress you tick yourself. Regular and PvE are separate profiles in
// the game, so they keep separate progress.
export interface Progress {
  tasks: Record<string, true>;
  objectives: Record<string, true>;
}

const stores: Record<GameMode, Store<Progress>> = {
  regular: createStore<Progress>('tarkovz.progress.regular.v1', { tasks: {}, objectives: {} }),
  pve: createStore<Progress>('tarkovz.progress.pve.v1', { tasks: {}, objectives: {} }),
};

export const useProgress = (mode: GameMode) => useStore(stores[mode]);

function toggle(record: Record<string, true>, id: string): Record<string, true> {
  const next = { ...record };
  if (next[id]) delete next[id];
  else next[id] = true;
  return next;
}

export function toggleTask(mode: GameMode, id: string) {
  stores[mode].set((p) => ({ ...p, tasks: toggle(p.tasks, id) }));
}

/** Marks tasks done; returns how many weren't already. */
export function markTasksDone(mode: GameMode, ids: Iterable<string>): number {
  let added = 0;
  stores[mode].set((p) => {
    const tasks = { ...p.tasks };
    for (const id of ids) {
      if (!tasks[id]) {
        tasks[id] = true;
        added++;
      }
    }
    return added ? { ...p, tasks } : p;
  });
  return added;
}

export function toggleObjective(mode: GameMode, id: string) {
  stores[mode].set((p) => ({ ...p, objectives: toggle(p.objectives, id) }));
}
