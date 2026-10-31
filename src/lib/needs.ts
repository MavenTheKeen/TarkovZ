import type { HideoutStation, Task } from '../api/types';
import type { Progress } from './progress';

export interface ItemNeed {
  kind: 'quest' | 'hideout';
  /** Task name, or "Station level N". */
  label: string;
  count: number;
  foundInRaid: boolean;
  /** Task id or station id. */
  refId: string;
}

// Objectives that accept any of many items (e.g. "hand over any weapon") say
// nothing useful about a single item, so they're left out.
const MAX_ALTERNATIVES = 3;

/**
 * Everything your unfinished quests and unbuilt hideout levels still need,
 * indexed by item id. Answers "should I keep this?".
 */
export function buildNeedsIndex(
  tasks: Task[],
  progress: Progress,
  stations: HideoutStation[],
  hideoutLevels: Record<string, number>,
): Map<string, ItemNeed[]> {
  const index = new Map<string, ItemNeed[]>();
  const add = (itemId: string, need: ItemNeed) => {
    const list = index.get(itemId);
    if (list) list.push(need);
    else index.set(itemId, [need]);
  };

  for (const task of tasks) {
    if (progress.tasks[task.id]) continue;
    for (const o of task.objectives) {
      if (o.type !== 'giveItem' || progress.objectives[o.id] || o.items.length > MAX_ALTERNATIVES) continue;
      for (const item of o.items) {
        add(item, { kind: 'quest', label: task.name, count: o.count ?? 1, foundInRaid: !!o.foundInRaid, refId: task.id });
      }
    }
  }

  for (const station of stations) {
    for (const level of station.levels) {
      if (level.level <= (hideoutLevels[station.id] ?? 0)) continue;
      for (const r of level.itemRequirements) {
        add(r.item, {
          kind: 'hideout',
          label: `${station.name} level ${level.level}`,
          count: r.count,
          foundInRaid: r.foundInRaid,
          refId: station.id,
        });
      }
    }
  }
  return index;
}

/** Total count needed, and how many of those must be found in raid. */
export function totalNeeded(needs: ItemNeed[] | undefined): { total: number; fir: number } {
  return (needs ?? []).reduce(
    (acc, n) => ({ total: acc.total + n.count, fir: acc.fir + (n.foundInRaid ? n.count : 0) }),
    { total: 0, fir: 0 },
  );
}
