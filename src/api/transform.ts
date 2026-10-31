// Converts raw feed JSON into the slim types in types.ts. The raw feeds are
// large and loosely shaped, so they are typed as `any` here and nowhere else.

import type { Feed } from './client';
import type {
  Barter,
  HideoutStation,
  GameMap,
  Item,
  ItemsFeed,
  MapConfig,
  Objective,
  Position,
  QuestItem,
  Task,
  Trader,
} from './types';

type Raw = any;

const pos = (p: Raw): Position => ({ x: p.x, y: p.y ?? 0, z: p.z });
const outline = (o: Raw): Position[] => (Array.isArray(o) ? o.map(pos) : []);

/** "ZoneOldAzs" -> "Old Azs", for spawn zones without a translation. */
function prettifyZone(zoneName: string): string {
  // Some zones are only named by a GUID.
  if (!zoneName || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(zoneName)) return 'Unnamed spawn';
  return zoneName
    .replace(/^Zone_?/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || zoneName;
}

export function slimMaps(feed: Feed<Raw>): GameMap[] {
  const mobs: Record<string, Raw> = feed.data.mobs ?? {};
  // Untranslated mobs come back as their id, e.g. "infectedScreamer" -> "Infected Screamer".
  const mobName = (id: string) => {
    const name: string = mobs[id]?.name ?? id;
    return name === id ? name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) : name;
  };
  return Object.values(feed.data.maps as Record<string, Raw>).map((m) => ({
    id: m.id,
    name: m.name,
    normalizedName: m.normalizedName,
    nameId: m.nameId ?? '',
    description: m.description ?? '',
    wiki: m.wiki ?? null,
    raidDuration: m.raidDuration ?? null,
    players: m.players ?? null,
    // Untranslated enemies come through as camelCase ids, like mobs.
    enemies: [...new Set<string>((m.enemies ?? []).map((e: string) => (/^[a-z]+[A-Z]/.test(e) ? mobName(e) : e)))],
    extracts: (m.extracts ?? []).map((e: Raw) => ({
      id: e.id,
      name: e.name,
      faction: e.faction ?? null,
      position: pos(e.position),
      outline: outline(e.outline),
      switches: (e.switches ?? []).filter((s: Raw) => typeof s === 'string'),
      transferItem: e.transferItem ? { item: e.transferItem.item, count: e.transferItem.count ?? 1 } : null,
    })),
    transits: (m.transits ?? []).map((t: Raw) => ({
      id: String(t.id),
      description: t.description ?? '',
      map: t.map,
      position: pos(t.position),
      outline: outline(t.outline),
    })),
    spawns: (m.spawns ?? []).map((s: Raw) => ({
      position: pos(s.position),
      sides: s.sides ?? [],
      categories: s.categories ?? [],
      zoneName: s.zoneName ?? '',
      label: feed.dict[s.zoneName] ?? prettifyZone(s.zoneName ?? ''),
    })),
    bosses: (m.bosses ?? []).map((b: Raw) => ({
      id: b.mob,
      name: mobName(b.mob),
      spawnChance: b.spawnChance ?? 0,
      locations: (b.spawnLocations ?? []).map((l: Raw) => ({
        name: l.name,
        spawnKey: l.spawnKey,
        chance: l.chance ?? 0,
        positions: (l.positions ?? []).map(pos),
      })),
      escorts: [...new Set<string>((b.escorts ?? []).map((e: Raw) => mobName(e.mob)))],
    })),
    switches: (m.switches ?? []).map((s: Raw) => ({ id: s.id, name: s.name })),
    lootLoose: (m.lootLoose ?? []).map((l: Raw) => ({ position: pos(l.position), items: l.items ?? [] })),
  }));
}

/** Picks the interactive (2D, top-down) projection of each map in maps.json. */
export function slimMapConfigs(raw: Raw[]): MapConfig[] {
  const configs: MapConfig[] = [];
  for (const entry of raw) {
    const m = (entry.maps ?? []).find((x: Raw) => x.projection === 'interactive');
    if (!m?.transform || !m.bounds) continue;
    configs.push({
      key: m.key,
      normalizedName: entry.normalizedName,
      altMaps: m.altMaps ?? [],
      transform: m.transform,
      coordinateRotation: m.coordinateRotation ?? 0,
      bounds: m.bounds,
      svgBounds: m.svgBounds,
      svgPath: m.svgPath,
      svgLayer: m.svgLayer,
      tilePath: m.tilePath,
      tileSize: m.tileSize ?? 256,
      minZoom: m.minZoom ?? 1,
      maxZoom: m.maxZoom ?? 6,
      author: m.author,
      authorLink: m.authorLink,
      layers: (m.layers ?? []).map((l: Raw) => ({
        name: l.name,
        svgLayer: l.svgLayer,
        tilePath: l.tilePath,
        extents: (l.extents ?? [])
          .filter((e: Raw) => Array.isArray(e.height))
          .map((e: Raw) => ({
            height: e.height,
            // Each area is [[x, z], [x, z], name], two opposite corners in game coordinates.
            areas: (e.bounds ?? []).map(([a, b, name]: [number[], number[], string?]) => ({
              x1: Math.min(a[0], b[0]),
              z1: Math.min(a[1], b[1]),
              x2: Math.max(a[0], b[0]),
              z2: Math.max(a[1], b[1]),
              name,
            })),
          })),
      })),
      labels: (m.labels ?? []).filter((l: Raw) => Array.isArray(l.position) && l.text),
    });
  }
  return configs;
}

/**
 * Finds the map image config for a game map. Variants such as Night Factory
 * share their base map's image; infected and tutorial variants fall back to
 * the map they are built on.
 */
export function findMapConfig(configs: MapConfig[], normalizedName: string): MapConfig | undefined {
  const direct = configs.find((c) => c.normalizedName === normalizedName || c.altMaps.includes(normalizedName));
  if (direct) return direct;
  const base = normalizedName.replace(/^infected-/, '').replace(/-(tutorial|dark|21)$/, '');
  if (base === normalizedName) return undefined;
  return findMapConfig(configs, base) ?? configs.find((c) => c.normalizedName === `the-${base}`);
}

function slimObjective(o: Raw): Objective {
  const items: string[] = Array.isArray(o.items) ? o.items : o.item ? [o.item] : [];
  return {
    id: o.id,
    description: o.description ?? '',
    type: o.type,
    optional: !!o.optional,
    count: o.count,
    maps: o.maps ?? [],
    zones: (o.zones ?? [])
      .filter((z: Raw) => z.position && z.map)
      .map((z: Raw) => ({
        id: z.id,
        map: z.map,
        position: pos(z.position),
        outline: outline(z.outline),
        top: z.top,
        bottom: z.bottom,
      })),
    possibleLocations: (o.possibleLocations ?? []).map((l: Raw) => ({
      map: l.map,
      positions: (l.positions ?? []).map(pos),
    })),
    items,
    foundInRaid: o.foundInRaid,
    questItem: o.questItem,
    markerItem: o.markerItem,
  };
}

export function slimTasks(feed: Feed<Raw>): { tasks: Task[]; questItems: QuestItem[] } {
  const tasks = Object.values(feed.data.tasks as Record<string, Raw>).map(
    (t): Task => ({
      id: t.id,
      name: t.name,
      normalizedName: t.normalizedName,
      trader: t.trader,
      minPlayerLevel: t.minPlayerLevel ?? 0,
      factionName: t.factionName ?? 'Any',
      kappaRequired: !!t.kappaRequired,
      lightkeeperRequired: !!t.lightkeeperRequired,
      wikiLink: t.wikiLink ?? null,
      map: t.map ?? null,
      taskRequirements: (t.taskRequirements ?? []).map((r: Raw) => ({ task: r.task, status: r.status ?? [] })),
      objectives: (t.objectives ?? []).map(slimObjective),
      neededKeys: (t.neededKeys ?? []).map((k: Raw) => ({ map: k.map, keys: k.keys ?? [] })),
    }),
  );
  const questItems = Object.values((feed.data.questItems ?? {}) as Record<string, Raw>).map(
    (q): QuestItem => ({ id: q.id, name: q.name, shortName: q.shortName, iconLink: q.iconLink ?? null }),
  );
  return { tasks, questItems };
}

export function slimItems(feed: Feed<Raw>): ItemsFeed {
  const items = Object.values(feed.data.items as Record<string, Raw>).map(
    (i): Item => ({
      id: i.id,
      name: i.name,
      shortName: i.shortName,
      normalizedName: i.normalizedName,
      width: i.width ?? 1,
      height: i.height ?? 1,
      basePrice: i.basePrice ?? 0,
      avg24hPrice: i.avg24hPrice || null,
      low24hPrice: i.low24hPrice || null,
      high24hPrice: i.high24hPrice || null,
      lastLowPrice: i.lastLowPrice || null,
      changeLast48h: i.changeLast48h ?? null,
      changeLast48hPercent: i.changeLast48hPercent ?? null,
      updated: i.updated ?? null,
      iconLink: i.iconLink ?? null,
      wikiLink: i.wikiLink ?? null,
      types: i.types ?? [],
      sellToTrader: (i.sellToTrader ?? []).map((o: Raw) => ({
        trader: o.trader,
        price: o.price,
        priceRUB: o.priceRUB,
        currency: o.currency,
      })),
      ammo:
        i.properties?.propertiesType === 'ItemPropertiesAmmo'
          ? {
              caliber: i.properties.caliber ?? '',
              damage: i.properties.damage ?? 0,
              penetration: i.properties.penetrationPower ?? 0,
              armorDamage: i.properties.armorDamage ?? 0,
              fragmentation: i.properties.fragmentationChance ?? 0,
              speed: i.properties.initialSpeed ?? 0,
              projectiles: i.properties.projectileCount ?? 1,
              tracer: !!i.properties.tracer,
            }
          : undefined,
      buyFromTrader: (i.buyFromTrader ?? []).map((o: Raw) => ({
        trader: o.trader,
        price: o.price,
        priceRUB: o.priceRUB,
        currency: o.currency,
        minTraderLevel: o.minTraderLevel ?? 1,
        taskUnlock: o.taskUnlock ?? null,
      })),
    }),
  );
  const flea = feed.data.fleaMarket ?? {};
  return {
    items,
    fleaMarket: {
      offerRate: flea.sellOfferFeeRate ?? 0.05,
      requirementRate: flea.sellRequirementFeeRate ?? 0.05,
      minPlayerLevel: flea.minPlayerLevel ?? 15,
    },
    gpCoinValue: feed.data.settings?.gpCoinValue ?? 0,
  };
}

export function slimTraders(feed: Feed<Raw>): Trader[] {
  return Object.values(feed.data as Record<string, Raw>).map((t) => ({
    id: t.id,
    name: t.name,
    normalizedName: t.normalizedName,
    maxLevel: (t.levels ?? []).length || 4,
    resetTime: t.resetTime ?? null,
  }));
}

export function slimHideout(feed: Feed<Raw>): HideoutStation[] {
  return Object.values(feed.data as Record<string, Raw>).map((st) => ({
    id: st.id,
    name: st.name,
    normalizedName: st.normalizedName,
    levels: (st.levels ?? [])
      .map((l: Raw) => ({
        level: l.level,
        constructionTime: l.constructionTime ?? 0,
        itemRequirements: (l.itemRequirements ?? []).map((r: Raw) => ({
          item: r.item,
          count: r.count ?? 1,
          foundInRaid: !!r.attributes?.foundInRaid,
        })),
        stationLevelRequirements: (l.stationLevelRequirements ?? []).map((r: Raw) => ({ station: r.station, level: r.level })),
        traderRequirements: (l.traderRequirements ?? [])
          .filter((r: Raw) => r.requirementType === undefined || r.requirementType === 'level')
          .map((r: Raw) => ({ trader: r.trader, level: r.value ?? r.level ?? 1 })),
      }))
      .sort((a: { level: number }, b: { level: number }) => a.level - b.level),
  }));
}

export function slimBarters(feed: Feed<Raw>): Barter[] {
  return Object.values(feed.data as Record<string, Raw>)
    .filter((b) => b.offeredItem)
    .map((b) => ({
      id: b.id,
      trader: b.trader,
      minTraderLevel: b.minTraderLevel ?? 1,
      taskUnlock: b.taskUnlock ?? null,
      buyLimit: b.buyLimit ?? null,
      requiredItems: (b.requiredItems ?? []).map((r: Raw) => ({ item: r.item, count: r.count ?? 1 })),
      offeredItem: { item: b.offeredItem.item, count: b.offeredItem.count ?? 1 },
    }));
}
