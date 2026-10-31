import type { GameMap, Item, QuestItem, Task } from '../api/types';
import type { GamePoint } from './projection';
import { objectivePlacements } from './mapFeatures';

export interface SearchEntry {
  key: string;
  label: string;
  kind: 'Quest' | 'Quest item' | 'Item' | 'Extract' | 'Transit' | 'Boss';
  mapId: string;
  mapName: string;
  points: GamePoint[];
  questId?: string;
}

const xz = (p: { x: number; z: number }): GamePoint => ({ x: p.x, z: p.z });

/** Everything on any map that can be found by name, one entry per thing per map. */
export function buildSearchIndex(
  maps: GameMap[],
  tasks: Task[],
  questItems: Map<string, QuestItem>,
  items: Map<string, Item> | undefined,
): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const map of maps) {
    const base = { mapId: map.id, mapName: map.name };

    for (const e of map.extracts) {
      entries.push({ ...base, key: `x:${map.id}:${e.id}`, label: e.name, kind: 'Extract', points: [xz(e.position)] });
    }
    for (const t of map.transits) {
      entries.push({ ...base, key: `t:${map.id}:${t.id}`, label: t.description, kind: 'Transit', points: [xz(t.position)] });
    }

    const bossPoints = new Map<string, { name: string; points: GamePoint[] }>();
    for (const b of map.bosses) {
      const entry = bossPoints.get(b.id) ?? { name: b.name, points: [] };
      for (const loc of b.locations) {
        const pts = loc.positions.length
          ? loc.positions.map(xz)
          : map.spawns.filter((s) => s.zoneName === loc.spawnKey && !s.categories.includes('player')).map((s) => xz(s.position));
        entry.points.push(...pts);
      }
      bossPoints.set(b.id, entry);
    }
    for (const [id, { name, points }] of bossPoints) {
      if (points.length) entries.push({ ...base, key: `b:${map.id}:${id}`, label: name, kind: 'Boss', points });
    }

    if (items) {
      const loot = new Map<string, GamePoint[]>();
      for (const l of map.lootLoose) {
        for (const id of l.items) {
          const list = loot.get(id);
          if (list) list.push(xz(l.position));
          else loot.set(id, [xz(l.position)]);
        }
      }
      for (const [id, points] of loot) {
        const item = items.get(id);
        if (item) entries.push({ ...base, key: `i:${map.id}:${id}`, label: item.name, kind: 'Item', points });
      }
    }
  }

  const mapNames = new Map(maps.map((m) => [m.id, m.name]));
  for (const task of tasks) {
    const perMap = new Map<string, GamePoint[]>();
    for (const o of task.objectives) {
      const mapIds = new Set([...o.zones.map((z) => z.map), ...o.possibleLocations.map((l) => l.map)]);
      for (const mapId of mapIds) {
        const { zones, spots } = objectivePlacements(o, mapId);
        const pts = [...zones.map((z) => xz(z.position)), ...spots];
        perMap.set(mapId, [...(perMap.get(mapId) ?? []), ...pts]);

        if (o.questItem && spots.length) {
          const qi = questItems.get(o.questItem);
          if (qi && mapNames.has(mapId)) {
            entries.push({
              key: `q:${mapId}:${o.id}`,
              label: qi.name,
              kind: 'Quest item',
              mapId,
              mapName: mapNames.get(mapId)!,
              points: spots,
              questId: task.id,
            });
          }
        }
      }
    }
    // Quests with objectives on a map but no positions are still findable:
    // choosing one opens the map and its quest list.
    for (const o of task.objectives) {
      for (const mapId of o.maps) if (!perMap.has(mapId)) perMap.set(mapId, []);
    }
    for (const [mapId, points] of perMap) {
      if (!mapNames.has(mapId)) continue;
      entries.push({
        key: `k:${mapId}:${task.id}`,
        label: task.name,
        kind: 'Quest',
        mapId,
        mapName: mapNames.get(mapId)!,
        points,
        questId: task.id,
      });
    }
  }

  // Merge same-named things on the same map, e.g. PMC and Scav extracts sharing a name.
  const merged = new Map<string, SearchEntry>();
  for (const e of entries) {
    const key = `${e.kind}|${e.mapId}|${e.label}`;
    const existing = merged.get(key);
    if (existing) existing.points = [...existing.points, ...e.points];
    else merged.set(key, { ...e });
  }
  return [...merged.values()];
}

/** Simple ranked substring match: names starting with the query come first. */
export function searchEntries(index: SearchEntry[], query: string, limit = 40): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const label = entry.label.toLowerCase();
    const at = label.indexOf(q);
    if (at < 0) continue;
    scored.push({ entry, score: (at === 0 ? 0 : 1) + label.length / 1000 });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
