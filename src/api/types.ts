// Slimmed-down shapes of the tarkov.dev JSON feeds: only the fields the app
// uses, with translations already merged in. These are what gets cached.

export type GameMode = 'regular' | 'pve';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Extract {
  id: string;
  name: string;
  faction: 'pmc' | 'scav' | 'shared' | null;
  position: Position;
  outline: Position[];
  /** Ids of switches that must be used before the extract opens. */
  switches: string[];
  /** Item handed over to use the extract (payment or a specific item). */
  transferItem: { item: string; count: number } | null;
}

export interface Transit {
  id: string;
  description: string;
  /** Destination map id. */
  map: string;
  position: Position;
  outline: Position[];
}

export interface Spawn {
  position: Position;
  sides: string[];
  categories: string[];
  zoneName: string;
  label: string;
}

export interface BossSpawn {
  id: string;
  name: string;
  spawnChance: number;
  locations: { name: string; spawnKey: string; chance: number; positions: Position[] }[];
  escorts: string[];
}

export interface LooseLoot {
  position: Position;
  items: string[];
}

export interface GameMap {
  id: string;
  name: string;
  normalizedName: string;
  /** The game's own id for the location, as it appears in the game logs (e.g. "bigmap"). */
  nameId: string;
  description: string;
  wiki: string | null;
  raidDuration: number | null;
  players: string | null;
  enemies: string[];
  extracts: Extract[];
  transits: Transit[];
  spawns: Spawn[];
  bosses: BossSpawn[];
  switches: { id: string; name: string }[];
  lootLoose: LooseLoot[];
}

/** Display settings for one map image, from the tarkov.dev site's maps.json. */
export interface MapConfig {
  key: string;
  normalizedName: string;
  altMaps: string[];
  transform: [number, number, number, number];
  coordinateRotation: number;
  bounds: [[number, number], [number, number]];
  svgBounds?: [[number, number], [number, number]];
  svgPath?: string;
  svgLayer?: string;
  tilePath?: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  author?: string;
  authorLink?: string;
  /** Extra floors (upper levels, basements). */
  layers: MapLayer[];
  labels: { position: number[]; text: string; rotation?: number; size?: number }[];
}

/**
 * One floor of a map. A point is on it when its height falls in one of the
 * extents' ranges, inside that extent's areas (or anywhere, if it has none).
 */
export interface MapLayer {
  name: string;
  svgLayer?: string;
  tilePath?: string;
  extents: { height: [number, number]; areas: { x1: number; z1: number; x2: number; z2: number; name?: string }[] }[];
}

export interface TaskZone {
  id: string;
  map: string;
  position: Position;
  outline: Position[];
  top?: number;
  bottom?: number;
}

export interface Objective {
  id: string;
  description: string;
  type: string;
  optional: boolean;
  count?: number;
  maps: string[];
  zones: TaskZone[];
  possibleLocations: { map: string; positions: Position[] }[];
  /** Acceptable items (any one of them) for give/find/plant objectives. */
  items: string[];
  foundInRaid?: boolean;
  questItem?: string;
  markerItem?: string;
}

export interface Task {
  id: string;
  name: string;
  normalizedName: string;
  trader: string;
  minPlayerLevel: number;
  factionName: 'Any' | 'BEAR' | 'USEC';
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
  wikiLink: string | null;
  map: string | null;
  taskRequirements: { task: string; status: string[] }[];
  objectives: Objective[];
  neededKeys: { map: string; keys: string[] }[];
}

export interface QuestItem {
  id: string;
  name: string;
  shortName: string;
  iconLink: string | null;
}

export interface TraderOffer {
  trader: string;
  price: number;
  priceRUB: number;
  currency: string;
}

/** Ballistics for ammo items. */
export interface AmmoStats {
  caliber: string;
  damage: number;
  penetration: number;
  armorDamage: number;
  /** 0–1 chance. */
  fragmentation: number;
  speed: number;
  projectiles: number;
  tracer: boolean;
}

export interface Item {
  id: string;
  name: string;
  shortName: string;
  normalizedName: string;
  width: number;
  height: number;
  basePrice: number;
  avg24hPrice: number | null;
  low24hPrice: number | null;
  high24hPrice: number | null;
  lastLowPrice: number | null;
  changeLast48h: number | null;
  changeLast48hPercent: number | null;
  /** When the prices were last updated (ISO time). */
  updated: string | null;
  iconLink: string | null;
  wikiLink: string | null;
  types: string[];
  sellToTrader: TraderOffer[];
  buyFromTrader: (TraderOffer & { minTraderLevel: number; taskUnlock: string | null })[];
  ammo?: AmmoStats;
}

export interface ItemsFeed {
  items: Item[];
  fleaMarket: { offerRate: number; requirementRate: number; minPlayerLevel: number };
  gpCoinValue: number;
}

export interface Trader {
  id: string;
  name: string;
  normalizedName: string;
  maxLevel: number;
  /** When the trader next restocks (ISO time). */
  resetTime: string | null;
}

export interface HideoutLevel {
  level: number;
  /** Seconds. */
  constructionTime: number;
  itemRequirements: { item: string; count: number; foundInRaid: boolean }[];
  stationLevelRequirements: { station: string; level: number }[];
  traderRequirements: { trader: string; level: number }[];
}

export interface HideoutStation {
  id: string;
  name: string;
  normalizedName: string;
  levels: HideoutLevel[];
}

export interface Barter {
  id: string;
  trader: string;
  minTraderLevel: number;
  taskUnlock: string | null;
  buyLimit: number | null;
  requiredItems: { item: string; count: number }[];
  offeredItem: { item: string; count: number };
}
