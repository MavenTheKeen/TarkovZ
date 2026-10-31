import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cached, fetchFeed, getJson, getText } from './client';
import { slimBarters, slimHideout, slimItems, slimMapConfigs, slimMaps, slimTasks, slimTraders } from './transform';
import type { GameMode, HideoutStation, Item, QuestItem, Task, Trader } from './types';

// Bump when a slim shape changes so old disk caches are ignored.
const V = 'v5';

// The map image settings (bounds, transform, image URLs) maintained by the
// tarkov.dev site, MIT licensed. Fetched at runtime rather than copied, so
// map fixes arrive without an app update.
const MAP_CONFIG_URL = 'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json';

export function useGameMaps(mode: GameMode) {
  return useQuery({
    queryKey: ['maps', mode],
    queryFn: async () => {
      const res = await cached(`${V}-${mode}-maps`, async () => slimMaps(await fetchFeed(mode, 'maps')));
      const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
      return { ...res, data: sorted, byId: new Map(sorted.map((m) => [m.id, m])) };
    },
  });
}

export function useMapConfigs() {
  return useQuery({
    queryKey: ['mapConfigs'],
    queryFn: () =>
      cached(`${V}-mapconfigs`, async () => {
        const raw = await getJson<unknown[]>(MAP_CONFIG_URL);
        return slimMapConfigs(raw);
      }),
  });
}

/** The map SVG text, cached on disk so the map still draws offline. */
export function useMapSvg(url: string | undefined) {
  return useQuery({
    queryKey: ['svg', url],
    enabled: !!url,
    staleTime: Infinity,
    queryFn: async () => {
      const name = url!.split('/').pop()!.replace(/\W+/g, '_').slice(0, 48);
      return (await cached(`${V}-svg-${name}`, () => getText(url!))).data;
    },
  });
}

export function useTasks(mode: GameMode) {
  return useQuery({
    queryKey: ['tasks', mode],
    queryFn: async () => {
      const res = await cached(`${V}-${mode}-tasks`, async () => slimTasks(await fetchFeed(mode, 'tasks')));
      return {
        ...res,
        byId: new Map<string, Task>(res.data.tasks.map((t) => [t.id, t])),
        questItemsById: new Map<string, QuestItem>(res.data.questItems.map((q) => [q.id, q])),
      };
    },
  });
}

export function useItems(mode: GameMode) {
  return useQuery({
    queryKey: ['items', mode],
    queryFn: async () => {
      const res = await cached(`${V}-${mode}-items`, async () => slimItems(await fetchFeed(mode, 'items')));
      return { ...res, byId: new Map<string, Item>(res.data.items.map((i) => [i.id, i])) };
    },
  });
}

export function useTraders(mode: GameMode) {
  return useQuery({
    queryKey: ['traders', mode],
    queryFn: async () => {
      const res = await cached(`${V}-${mode}-traders`, async () => slimTraders(await fetchFeed(mode, 'traders')));
      const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
      return { ...res, data: sorted, byId: new Map<string, Trader>(sorted.map((t) => [t.id, t])) };
    },
  });
}

export function useHideout(mode: GameMode) {
  return useQuery({
    queryKey: ['hideout', mode],
    queryFn: async () => {
      const res = await cached(`${V}-${mode}-hideout`, async () => slimHideout(await fetchFeed(mode, 'hideout')));
      const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
      return { ...res, data: sorted, byId: new Map<string, HideoutStation>(sorted.map((s) => [s.id, s])) };
    },
  });
}

export function useBarters(mode: GameMode) {
  return useQuery({
    queryKey: ['barters', mode],
    queryFn: () =>
      cached(`${V}-${mode}-barters`, async () => slimBarters(await fetchFeed(mode, 'barters', { translated: false }))),
  });
}

const EMPTY = new Map<never, never>();

/** The feeds most screens need, plus id lookups that work before they load. */
export function useLookups(mode: GameMode) {
  const maps = useGameMaps(mode);
  const tasks = useTasks(mode);
  const items = useItems(mode);
  const traders = useTraders(mode);
  const lookups = useMemo(
    () => ({
      maps: maps.data?.byId ?? EMPTY,
      tasks: tasks.data?.byId ?? EMPTY,
      questItems: tasks.data?.questItemsById ?? EMPTY,
      items: items.data?.byId ?? EMPTY,
      traders: traders.data?.byId ?? EMPTY,
    }),
    [maps.data, tasks.data, items.data, traders.data],
  );
  return { maps, tasks, items, traders, lookups };
}
