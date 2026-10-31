import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFeed } from '../api/client';

afterEach(() => vi.unstubAllGlobals());

describe('fetchFeed', () => {
  it('replaces translation keys at the paths the feed lists', async () => {
    const feed = {
      data: {
        tasks: {
          a: { name: 'a name', objectives: [{ description: 'obj1', bodyParts: ['Head'] }] },
        },
      },
      translations: ['$.data.tasks.*.name', '$.data.tasks.*.objectives[*].description', '$.data.tasks.*.objectives[*]..bodyParts[*]'],
    };
    const dict = { 'a name': 'Debut', obj1: 'Eliminate Scavs', Head: 'head' };
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith('_en') ? { data: dict } : structuredClone(feed)),
    }));

    const { data } = await fetchFeed<typeof feed.data>('regular', 'tasks');
    expect(data.tasks.a.name).toBe('Debut');
    expect(data.tasks.a.objectives[0].description).toBe('Eliminate Scavs');
    expect(data.tasks.a.objectives[0].bodyParts[0]).toBe('head');
  });

  it('fails rather than returning untranslated data when the names file is missing', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('_en') ? { ok: false, status: 404 } : { ok: true, json: async () => ({ data: {}, translations: [] }) },
    );
    await expect(fetchFeed('regular', 'tasks')).rejects.toThrow(/404/);
  });
});
