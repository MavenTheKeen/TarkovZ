import { createStore, useStore, type Store } from './store';
import type { GameMode, HideoutStation } from '../api/types';

// Your built level per hideout station id. Regular and PvE are separate profiles.
type Levels = Record<string, number>;

const stores: Record<GameMode, Store<Levels>> = {
  regular: createStore<Levels>('tarkovz.hideout.regular.v1', {}),
  pve: createStore<Levels>('tarkovz.hideout.pve.v1', {}),
};

export const useHideoutLevels = (mode: GameMode) => useStore(stores[mode]);

export function setHideoutLevel(mode: GameMode, stationId: string, level: number) {
  stores[mode].set((l) => ({ ...l, [stationId]: level }));
}

/** Levels still to build, each with what it needs. */
export function upcomingLevels(stations: HideoutStation[], levels: Levels) {
  return stations.flatMap((station) =>
    station.levels.filter((l) => l.level > (levels[station.id] ?? 0)).map((level) => ({ station, level })),
  );
}

/** Whether every requirement for a level, other than items, is already met by your station levels. */
export function canBuildNext(station: HideoutStation, levels: Levels): boolean {
  const next = station.levels.find((l) => l.level === (levels[station.id] ?? 0) + 1);
  return !!next && next.stationLevelRequirements.every((r) => (levels[r.station] ?? 0) >= r.level);
}
