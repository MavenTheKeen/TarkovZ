import { describe, expect, it } from 'vitest';
import { buildNeedsIndex, totalNeeded } from '../lib/needs';
import { caliberName, effectiveness } from '../lib/ammo';
import { formatClock } from '../lib/raidTimer';
import { canBuildNext, upcomingLevels } from '../lib/hideout';
import type { HideoutStation, Task } from '../api/types';

const task = (id: string, items: string[], count = 1, fir = false): Task => ({
  id,
  name: `Task ${id}`,
  normalizedName: id,
  trader: 't',
  minPlayerLevel: 1,
  factionName: 'Any',
  kappaRequired: false,
  lightkeeperRequired: false,
  wikiLink: null,
  map: null,
  taskRequirements: [],
  neededKeys: [],
  objectives: [
    { id: `${id}-give`, description: '', type: 'giveItem', optional: false, count, maps: [], zones: [], possibleLocations: [], items, foundInRaid: fir },
  ],
});

const medstation: HideoutStation = {
  id: 'med',
  name: 'Medstation',
  normalizedName: 'medstation',
  levels: [
    { level: 1, constructionTime: 0, itemRequirements: [{ item: 'bandage', count: 2, foundInRaid: false }], stationLevelRequirements: [], traderRequirements: [] },
    { level: 2, constructionTime: 0, itemRequirements: [{ item: 'salewa', count: 3, foundInRaid: true }], stationLevelRequirements: [{ station: 'vents', level: 1 }], traderRequirements: [] },
  ],
};

describe('buildNeedsIndex', () => {
  const tasks = [task('a', ['salewa'], 2, true), task('b', ['salewa']), task('many', ['x1', 'x2', 'x3', 'x4'])];

  it('collects quest and hideout needs for an item', () => {
    const index = buildNeedsIndex(tasks, { tasks: {}, objectives: {} }, [medstation], { med: 1 });
    const needs = index.get('salewa')!;
    expect(needs.map((n) => `${n.kind}:${n.label}:${n.count}`)).toEqual([
      'quest:Task a:2',
      'quest:Task b:1',
      'hideout:Medstation level 2:3',
    ]);
    expect(totalNeeded(needs)).toEqual({ total: 6, fir: 5 });
    // Level 1 is already built, so bandages aren't needed any more.
    expect(index.has('bandage')).toBe(false);
  });

  it('skips finished quests and "any of many" objectives', () => {
    const index = buildNeedsIndex(tasks, { tasks: { a: true }, objectives: { 'b-give': true } }, [], {});
    expect(index.has('salewa')).toBe(false);
    expect(index.has('x1')).toBe(false);
  });
});

describe('hideout', () => {
  it('lists unbuilt levels and knows when the next one is unblocked', () => {
    expect(upcomingLevels([medstation], { med: 1 }).map((u) => u.level.level)).toEqual([2]);
    expect(canBuildNext(medstation, { med: 1 })).toBe(false);
    expect(canBuildNext(medstation, { med: 1, vents: 1 })).toBe(true);
    expect(canBuildNext(medstation, { med: 2 })).toBe(false); // nothing left to build
  });
});

describe('ammo', () => {
  it('rates penetration against armour classes by the 10× rule of thumb', () => {
    expect(effectiveness(45, 3)).toBe('great');
    expect(effectiveness(42, 4)).toBe('good');
    expect(effectiveness(35, 4)).toBe('poor');
    expect(effectiveness(20, 5)).toBe('bad');
  });

  it('names calibres', () => {
    expect(caliberName('Caliber545x39')).toBe('5.45x39');
    expect(caliberName('Caliber762x54R')).toBe('7.62x54R');
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds, negative once time is up', () => {
    expect(formatClock(2100)).toBe('35:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-30)).toBe('-0:30');
  });
});
