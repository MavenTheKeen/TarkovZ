import type { Extract, GameMap, Item, Objective, QuestItem, Task, Trader } from '../api/types';
import type { Progress } from './progress';
import type { Settings } from './settings';
import type { GamePoint } from './projection';
import { centroid, distance2d } from './geometry';

export type FeatureKind = 'extract' | 'transit' | 'spawn' | 'boss' | 'quest';

/** Anything drawn on the map: a pin, optionally with a shaded outline. */
export interface Feature {
  id: string;
  kind: FeatureKind;
  title: string;
  details: string[];
  position: GamePoint;
  outline?: GamePoint[];
  /** CSS modifier, e.g. the extract faction. */
  variant?: string;
  questId?: string;
  objectiveId?: string;
  extractId?: string;
}

export interface Lookups {
  items: Map<string, Item>;
  questItems: Map<string, QuestItem>;
  maps: Map<string, GameMap>;
  traders: Map<string, Trader>;
}

const xz = (p: { x: number; y?: number; z: number }): GamePoint => ({ x: p.x, z: p.z, y: p.y });

export function itemName(id: string, lookups: Pick<Lookups, 'items' | 'questItems'>): string {
  return lookups.items.get(id)?.name ?? lookups.questItems.get(id)?.name ?? 'Unknown item';
}

export function factionLabel(faction: Extract['faction']): string {
  if (faction === 'pmc') return 'PMC';
  if (faction === 'scav') return 'Scav';
  return 'PMC & Scav';
}

/** What an extract needs, in words. The data can't say whether it is open in your raid. */
export function extractRequirement(extract: Extract, map: GameMap, lookups: Pick<Lookups, 'items' | 'questItems'>): string {
  const needs: string[] = [];
  if (extract.transferItem) {
    const { item, count } = extract.transferItem;
    needs.push(`${count.toLocaleString('en-US')} × ${itemName(item, lookups)}`);
  }
  for (const id of extract.switches) {
    const sw = map.switches.find((s) => s.id === id);
    needs.push(`use ${sw?.name ?? 'a switch'}`);
  }
  return needs.length ? `Needs ${needs.join(', ')}` : 'No requirement listed';
}

export function extractUsable(extract: Extract, side: Settings['side'], owned: Record<string, true>): {
  usable: boolean;
  reason?: string;
} {
  if (extract.faction && extract.faction !== 'shared' && extract.faction !== side) {
    return { usable: false, reason: `${factionLabel(extract.faction)} only` };
  }
  const item = extract.transferItem?.item;
  // Roubles payments are assumed affordable; any other item must be marked as carried.
  if (item && item !== '5449016a4bdc2d6f028b456f' && !owned[item]) {
    return { usable: false, reason: 'Needs an item you have not marked as carried' };
  }
  return { usable: true };
}

export function isTaskForFaction(task: Task, faction: Settings['faction']): boolean {
  return task.factionName === 'Any' || task.factionName === faction;
}

/** You can take the task now: its prerequisites are ticked done and you're at its level. */
export function isTaskAvailable(task: Task, progress: Progress, playerLevel: number): boolean {
  return (
    task.minPlayerLevel <= playerLevel &&
    task.taskRequirements.every((r) => !r.status.includes('complete') || progress.tasks[r.task])
  );
}

/** Positions of one objective on one map: zones (areas) and spot positions (pins). */
export function objectivePlacements(objective: Objective, mapId: string) {
  const zones = objective.zones.filter((z) => z.map === mapId);
  const spots = objective.possibleLocations.filter((l) => l.map === mapId).flatMap((l) => l.positions.map(xz));
  return { zones, spots };
}

/** Every map an objective has markers on, with the points to jump to. */
export function objectiveTargets(objective: Objective): { mapId: string; points: GamePoint[] }[] {
  const ids = new Set([...objective.zones.map((z) => z.map), ...objective.possibleLocations.map((l) => l.map)]);
  return [...ids]
    .map((mapId) => {
      const { zones, spots } = objectivePlacements(objective, mapId);
      return { mapId, points: [...zones.map((z) => xz(z.position)), ...spots] };
    })
    .filter((t) => t.points.length > 0);
}

export function objectiveIsOnMap(objective: Objective, mapId: string): boolean {
  return (
    objective.maps.includes(mapId) ||
    objective.zones.some((z) => z.map === mapId) ||
    objective.possibleLocations.some((l) => l.map === mapId)
  );
}

export interface QuestOnMap {
  task: Task;
  placed: Objective[];
  /** Objectives that name this map but have no position in the data. */
  unplaced: Objective[];
}

/** Unfinished tasks with at least one unfinished objective on this map. */
export function questsOnMap(map: GameMap, tasks: Task[], progress: Progress, faction: Settings['faction']): QuestOnMap[] {
  const result: QuestOnMap[] = [];
  for (const task of tasks) {
    if (progress.tasks[task.id] || !isTaskForFaction(task, faction)) continue;
    const open = task.objectives.filter((o) => !progress.objectives[o.id] && objectiveIsOnMap(o, map.id));
    if (!open.length) continue;
    const placed = open.filter((o) => {
      const { zones, spots } = objectivePlacements(o, map.id);
      return zones.length > 0 || spots.length > 0;
    });
    result.push({ task, placed, unplaced: open.filter((o) => !placed.includes(o)) });
  }
  return result.sort((a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel || a.task.name.localeCompare(b.task.name));
}

/** Player spawn points for the chosen side. */
export function playerSpawns(map: GameMap, side: Settings['side']) {
  return map.spawns
    .map((spawn, index) => ({ spawn, index }))
    .filter(({ spawn }) => spawn.categories.includes('player') && (spawn.sides.includes('all') || spawn.sides.includes(side)));
}

export function buildFeatures(
  map: GameMap,
  tasks: Task[],
  progress: Progress,
  settings: Pick<Settings, 'side' | 'faction' | 'playerLevel'>,
  lookups: Lookups,
  /** Only quests you can take now, rather than every unfinished one. */
  onlyAvailable = false,
): Feature[] {
  const features: Feature[] = [];

  for (const e of map.extracts) {
    features.push({
      id: `extract:${e.id}`,
      kind: 'extract',
      title: e.name,
      details: [`Extract · ${factionLabel(e.faction)}`, extractRequirement(e, map, lookups)],
      position: xz(e.position),
      outline: e.outline.length > 2 ? e.outline.map(xz) : undefined,
      variant: e.faction ?? 'shared',
      extractId: e.id,
    });
  }

  for (const t of map.transits) {
    features.push({
      id: `transit:${t.id}`,
      kind: 'transit',
      title: t.description || `Transit to ${lookups.maps.get(t.map)?.name ?? 'another map'}`,
      details: ['Transit point', `Leads to ${lookups.maps.get(t.map)?.name ?? 'another map'}`],
      position: xz(t.position),
      outline: t.outline.length > 2 ? t.outline.map(xz) : undefined,
    });
  }

  for (const { spawn, index } of playerSpawns(map, settings.side)) {
    features.push({
      id: `spawn:${index}`,
      kind: 'spawn',
      title: `Spawn: ${spawn.label}`,
      details: [`Player spawn · ${spawn.sides.includes('all') ? 'PMC & Scav' : spawn.sides.join(', ').toUpperCase()}`],
      position: xz(spawn.position),
    });
  }

  for (const boss of map.bosses) {
    for (const loc of boss.locations) {
      let points = loc.positions.map(xz);
      if (!points.length) {
        points = map.spawns.filter((s) => s.zoneName === loc.spawnKey && !s.categories.includes('player')).map((s) => xz(s.position));
      }
      const chance = `${Math.round(boss.spawnChance * 100)}% spawn chance`;
      const where = `${loc.name}${boss.locations.length > 1 ? ` (${Math.round(loc.chance * 100)}% of spawns)` : ''}`;
      const escorts = boss.escorts.length ? [`Escorts: ${boss.escorts.join(', ')}`] : [];
      points.forEach((p, i) =>
        features.push({
          id: `boss:${boss.id}:${loc.spawnKey}:${i}`,
          kind: 'boss',
          title: boss.name,
          details: [`Boss · ${chance}`, where, ...escorts],
          position: p,
        }),
      );
    }
  }

  for (const { task, placed } of questsOnMap(map, tasks, progress, settings.faction)) {
    if (onlyAvailable && !isTaskAvailable(task, progress, settings.playerLevel)) continue;
    const trader = lookups.traders.get(task.trader)?.name ?? '';
    for (const o of placed) {
      const { zones, spots } = objectivePlacements(o, map.id);
      zones.forEach((z, i) =>
        features.push({
          id: `quest:${o.id}:zone:${i}`,
          kind: 'quest',
          title: task.name,
          details: [`Quest${trader ? ` · ${trader}` : ''}`, o.description],
          position: z.outline.length > 2 ? { ...centroid(z.outline.map(xz)), y: z.position.y } : xz(z.position),
          outline: z.outline.length > 2 ? z.outline.map(xz) : undefined,
          questId: task.id,
          objectiveId: o.id,
        }),
      );
      spots.forEach((p, i) =>
        features.push({
          id: `quest:${o.id}:spot:${i}`,
          kind: 'quest',
          title: task.name,
          details: [`Quest${trader ? ` · ${trader}` : ''}`, o.description],
          position: p,
          questId: task.id,
          objectiveId: o.id,
        }),
      );
    }
  }

  return features;
}

export interface RankedExtract {
  extract: Extract;
  distance: number;
  usable: boolean;
  reason?: string;
}

/** Extracts sorted by straight-line distance from a point: usable ones first. */
export function rankExtracts(
  map: GameMap,
  from: GamePoint,
  side: Settings['side'],
  owned: Record<string, true>,
): RankedExtract[] {
  return map.extracts
    .map((extract) => ({ extract, distance: distance2d(from, xz(extract.position)), ...extractUsable(extract, side, owned) }))
    .sort((a, b) => Number(b.usable) - Number(a.usable) || a.distance - b.distance);
}
