import type { Objective, Task } from '../api/types';
import { itemName, type Lookups } from './mapFeatures';

export interface RequiredItem {
  label: string;
  count: number;
  foundInRaid: boolean;
}

function describe(o: Objective, lookups: Pick<Lookups, 'items' | 'questItems'>): string {
  if (o.items.length === 0) return 'item';
  const first = itemName(o.items[0], lookups);
  return o.items.length === 1 ? first : `${first} or ${o.items.length - 1} other${o.items.length > 2 ? 's' : ''}`;
}

/** Items a task needs: what to bring into the raid, and what to hand in. */
export function requiredItems(task: Task, lookups: Pick<Lookups, 'items' | 'questItems'>) {
  const bring: RequiredItem[] = [];
  const handIn: RequiredItem[] = [];
  for (const o of task.objectives) {
    if (o.type === 'plantItem' || o.type === 'mark') {
      const label = o.markerItem ? itemName(o.markerItem, lookups) : describe(o, lookups);
      bring.push({ label, count: o.count ?? 1, foundInRaid: false });
    } else if (o.type === 'giveItem') {
      handIn.push({ label: describe(o, lookups), count: o.count ?? 1, foundInRaid: !!o.foundInRaid });
    }
  }
  for (const k of task.neededKeys) {
    for (const key of k.keys) bring.push({ label: itemName(key, lookups), count: 1, foundInRaid: false });
  }
  return { bring, handIn };
}
