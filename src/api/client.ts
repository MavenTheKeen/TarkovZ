// The only place that talks to the network. Screens use the hooks in data.ts;
// swapping the data source or cache only touches this folder.
//
// Data comes from json.tarkov.dev, the JSON feed the tarkov.dev site itself
// reads, which carries the same data as the GraphQL API at api.tarkov.dev.

import { JSONPath } from 'jsonpath-plus';
import type { GameMode } from './types';

const FEED_URL = 'https://json.tarkov.dev';
const LANGUAGE = 'en';

export interface Fetched<T> {
  data: T;
  /** When this data was fetched (ms since epoch). */
  fetchedAt: number;
  /** True when the network failed and this is the last good copy from disk. */
  fromCache: boolean;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

export interface Feed<T> {
  data: T;
  /** Translation dictionary, for strings the feed doesn't mark for translation. */
  dict: Record<string, string>;
}

/**
 * Fetches one feed (maps, tasks, items, ...) for a game mode and replaces its
 * translation keys with English text. Each feed lists the JSONPaths of its
 * translatable strings.
 */
export async function fetchFeed<T>(
  mode: GameMode,
  name: string,
  { translated = true }: { translated?: boolean } = {},
): Promise<Feed<T>> {
  // The translation file is required when the feed has one: caching a feed
  // without its names would show raw ids. Barters have none.
  const [body, lang] = await Promise.all([
    getJson<{ data: T; translations?: string[] }>(`${FEED_URL}/${mode}/${name}`),
    translated
      ? getJson<{ data: Record<string, string> }>(`${FEED_URL}/${mode}/${name}_${LANGUAGE}`)
      : Promise.resolve({ data: {} as Record<string, string> }),
  ]);
  const dict = lang.data;
  for (const path of body.translations ?? []) {
    JSONPath({
      path,
      json: body,
      resultType: 'all',
      eval: false,
      callback: (result: { value: unknown; parent: Record<string, unknown>; parentProperty: string }) => {
        if (typeof result.value === 'string' && result.parent) {
          result.parent[result.parentProperty] = dict[result.value] ?? result.value;
        }
      },
    });
  }
  return { data: body.data, dict };
}

export { getJson, getText };

/**
 * Runs a fetch, saving the result to disk on success. If the network is down,
 * returns the last good result instead so the app keeps working offline.
 */
export async function cached<T>(cacheKey: string, load: () => Promise<T>): Promise<Fetched<T>> {
  try {
    const data = await load();
    const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
    window.desktop?.cacheWrite(cacheKey, entry).catch(() => undefined);
    return { ...entry, fromCache: false };
  } catch (err) {
    const saved = (await window.desktop?.cacheRead(cacheKey).catch(() => null)) as CacheEntry<T> | null | undefined;
    if (saved) return { ...saved, fromCache: true };
    throw err;
  }
}
