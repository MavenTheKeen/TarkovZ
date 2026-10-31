import type { GameMode, Task } from '../api/types';
import { isTaskAvailable, isTaskForFaction } from './mapFeatures';
import type { Progress } from './progress';
import { createStore, useStore, type Store } from './store';

/** Roubles, dollars and euros: quests "need" millions of them, which would swamp any item list. */
export const CURRENCY_IDS = new Set(['5449016a4bdc2d6f028b456f', '5696686a4bdc2da3298b456a', '569668774bdc2da2298b4568']);

// Objectives that accept any of many items (e.g. "hand over any weapon") say
// nothing useful about a single item, so they're left out.
const MAX_ALTERNATIVES = 3;

export interface QuestUse {
  task: Task;
  count: number;
  foundInRaid: boolean;
  /** Handed in, or taken into the raid to plant or mark something. */
  use: 'hand-in' | 'bring';
  /** You can't take the quest yet: prerequisites not done or level too low. */
  locked: boolean;
}

export interface QuestItemNeed {
  itemId: string;
  total: number;
  /** How many of the total have to be found in raid. */
  fir: number;
  quests: QuestUse[];
  /** Lowest level of the quests that need it, for "soonest first" sorting. */
  minLevel: number;
}

/** Every item your unfinished quests still need, locked quests included. */
export function questItemNeeds(
  tasks: Task[],
  progress: Progress,
  playerLevel: number,
  faction: 'USEC' | 'BEAR',
): QuestItemNeed[] {
  const byItem = new Map<string, QuestItemNeed>();
  const add = (itemId: string, use: QuestUse) => {
    if (CURRENCY_IDS.has(itemId)) return;
    let need = byItem.get(itemId);
    if (!need) byItem.set(itemId, (need = { itemId, total: 0, fir: 0, quests: [], minLevel: Infinity }));
    need.total += use.count;
    if (use.foundInRaid) need.fir += use.count;
    need.minLevel = Math.min(need.minLevel, use.task.minPlayerLevel);
    const same = need.quests.find((q) => q.task.id === use.task.id && q.use === use.use && q.foundInRaid === use.foundInRaid);
    if (same) same.count += use.count;
    else need.quests.push(use);
  };

  for (const task of tasks) {
    if (progress.tasks[task.id] || !isTaskForFaction(task, faction)) continue;
    const locked = !isTaskAvailable(task, progress, playerLevel);
    for (const o of task.objectives) {
      if (progress.objectives[o.id]) continue;
      const count = o.count ?? 1;
      if (o.type === 'giveItem' && o.items.length <= MAX_ALTERNATIVES) {
        for (const item of o.items) add(item, { task, count, foundInRaid: !!o.foundInRaid, use: 'hand-in', locked });
      } else if (o.type === 'plantItem' || o.type === 'mark') {
        const item = o.markerItem ?? (o.items.length === 1 ? o.items[0] : undefined);
        if (item) add(item, { task, count, foundInRaid: false, use: 'bring', locked });
      }
    }
  }
  return [...byItem.values()];
}

// How many of each item you've put aside for quests, per game mode.
const collectedStores: Record<GameMode, Store<Record<string, number>>> = {
  regular: createStore<Record<string, number>>('tarkovz.questCollected.regular.v1', {}),
  pve: createStore<Record<string, number>>('tarkovz.questCollected.pve.v1', {}),
};

export const useCollected = (mode: GameMode) => useStore(collectedStores[mode]);

export function setCollected(mode: GameMode, itemId: string, count: number) {
  collectedStores[mode].set((c) => {
    const next = { ...c };
    if (count > 0) next[itemId] = count;
    else delete next[itemId];
    return next;
  });
}
