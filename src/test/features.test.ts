import { describe, expect, it } from 'vitest';
import { isTaskAvailable, questsOnMap, rankExtracts } from '../lib/mapFeatures';
import type { Extract, GameMap, Task } from '../api/types';

const ext = (id: string, x: number, z: number, faction: Extract['faction'], transferItem: Extract['transferItem'] = null): Extract => ({
  id,
  name: id,
  faction,
  position: { x, y: 0, z },
  outline: [],
  switches: [],
  transferItem,
});

const map: GameMap = {
  id: 'm',
  name: 'Test',
  normalizedName: 'test',
  nameId: 'test',
  description: '',
  wiki: null,
  raidDuration: 40,
  players: null,
  enemies: [],
  extracts: [
    ext('far-pmc', 300, 0, 'pmc'),
    ext('near-scav', 10, 0, 'scav'),
    ext('mid-shared', 0, 100, 'shared'),
    ext('paid', 50, 0, 'pmc', { item: 'roubles-not', count: 1 }),
  ],
  transits: [],
  spawns: [],
  bosses: [],
  switches: [],
  lootLoose: [],
};

describe('rankExtracts', () => {
  it('ranks usable extracts by straight-line distance and puts unusable ones last', () => {
    const ranked = rankExtracts(map, { x: 0, z: 0 }, 'pmc', {});
    expect(ranked.map((r) => r.extract.id)).toEqual(['mid-shared', 'far-pmc', 'near-scav', 'paid']);
    expect(ranked[0].distance).toBeCloseTo(100);
    expect(ranked.find((r) => r.extract.id === 'near-scav')?.usable).toBe(false);
  });

  it('treats an extract item as usable once marked as carried', () => {
    const ranked = rankExtracts(map, { x: 0, z: 0 }, 'pmc', { 'roubles-not': true });
    expect(ranked.map((r) => r.extract.id).slice(0, 3)).toEqual(['paid', 'mid-shared', 'far-pmc']);
  });
});

describe('questsOnMap', () => {
  const task: Task = {
    id: 't1',
    name: 'Test task',
    normalizedName: 'test-task',
    trader: 'trader',
    minPlayerLevel: 5,
    factionName: 'Any',
    kappaRequired: false,
    lightkeeperRequired: false,
    wikiLink: null,
    map: 'm',
    taskRequirements: [],
    neededKeys: [],
    objectives: [
      {
        id: 'zone', description: 'Visit the zone', type: 'visit', optional: false, maps: ['m'], items: [],
        zones: [{ id: 'z', map: 'm', position: { x: 1, y: 0, z: 1 }, outline: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }] }],
        possibleLocations: [],
      },
      { id: 'nopos', description: 'Survive', type: 'extract', optional: false, maps: ['m'], items: [], zones: [], possibleLocations: [] },
      { id: 'other', description: 'Elsewhere', type: 'visit', optional: false, maps: ['elsewhere'], items: [], zones: [], possibleLocations: [] },
    ],
  };

  it('splits objectives into placed and unplaced, ignoring other maps', () => {
    const [q] = questsOnMap(map, [task], { tasks: {}, objectives: {} }, 'USEC');
    expect(q.placed.map((o) => o.id)).toEqual(['zone']);
    expect(q.unplaced.map((o) => o.id)).toEqual(['nopos']);
  });

  it('hides finished tasks and finished objectives', () => {
    expect(questsOnMap(map, [task], { tasks: { t1: true }, objectives: {} }, 'USEC')).toEqual([]);
    const [q] = questsOnMap(map, [task], { tasks: {}, objectives: { zone: true } }, 'USEC');
    expect(q.placed).toEqual([]);
  });

  it('hides tasks for the other faction', () => {
    expect(questsOnMap(map, [{ ...task, factionName: 'BEAR' }], { tasks: {}, objectives: {} }, 'USEC')).toEqual([]);
  });

  it('is available only at its level with its prerequisites done', () => {
    const locked: Task = { ...task, taskRequirements: [{ task: 'pre', status: ['complete'] }] };
    const none = { tasks: {}, objectives: {} };
    expect(isTaskAvailable(task, none, 5)).toBe(true);
    expect(isTaskAvailable(task, none, 4)).toBe(false);
    expect(isTaskAvailable(locked, none, 5)).toBe(false);
    expect(isTaskAvailable(locked, { tasks: { pre: true }, objectives: {} }, 5)).toBe(true);
    // A prerequisite that only has to be started doesn't lock it.
    expect(isTaskAvailable({ ...task, taskRequirements: [{ task: 'pre', status: ['active'] }] }, none, 5)).toBe(true);
  });
});
