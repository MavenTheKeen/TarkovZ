import { describe, expect, it } from 'vitest';
import type { Objective, Task } from '../api/types';
import { questItemNeeds } from '../lib/questNeeds';

const objective = (id: string, type: string, items: string[], count: number, extra: Partial<Objective> = {}): Objective => ({
  id,
  description: id,
  type,
  optional: false,
  maps: [],
  items,
  count,
  zones: [],
  possibleLocations: [],
  ...extra,
});

const task = (id: string, objectives: Objective[], extra: Partial<Task> = {}): Task => ({
  id,
  name: id,
  normalizedName: id,
  trader: 'trader',
  minPlayerLevel: 1,
  factionName: 'Any',
  kappaRequired: false,
  lightkeeperRequired: false,
  wikiLink: null,
  map: null,
  taskRequirements: [],
  neededKeys: [],
  objectives,
  ...extra,
});

const ROUBLES = '5449016a4bdc2d6f028b456f';
const none = { tasks: {}, objectives: {} };

describe('questItemNeeds', () => {
  const tasks = [
    task('first', [objective('a', 'giveItem', ['bolts'], 2, { foundInRaid: true }), objective('b', 'giveItem', [ROUBLES], 50000)]),
    task('later', [objective('c', 'giveItem', ['bolts'], 3), objective('d', 'plantItem', [], 1, { markerItem: 'camera' })], {
      taskRequirements: [{ task: 'first', status: ['complete'] }],
    }),
    task('any-weapon', [objective('e', 'giveItem', ['w1', 'w2', 'w3', 'w4'], 1)]),
  ];

  it('totals items across quests, locked ones included, and skips currency and "any of" objectives', () => {
    const needs = questItemNeeds(tasks, none, 10, 'USEC');
    const bolts = needs.find((n) => n.itemId === 'bolts')!;
    expect(bolts.total).toBe(5);
    expect(bolts.fir).toBe(2);
    expect(bolts.quests.map((q) => [q.task.id, q.locked])).toEqual([
      ['first', false],
      ['later', true],
    ]);
    expect(needs.find((n) => n.itemId === 'camera')?.quests[0].use).toBe('bring');
    expect(needs.map((n) => n.itemId)).not.toContain(ROUBLES);
    expect(needs.map((n) => n.itemId)).not.toContain('w1');
  });

  it('drops finished quests and objectives', () => {
    const needs = questItemNeeds(tasks, { tasks: { first: true }, objectives: { c: true } }, 10, 'USEC');
    expect(needs.find((n) => n.itemId === 'bolts')).toBeUndefined();
    // "later" is now unlocked.
    expect(needs.find((n) => n.itemId === 'camera')?.quests[0].locked).toBe(false);
  });
});
