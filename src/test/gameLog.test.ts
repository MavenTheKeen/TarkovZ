import { describe, expect, it } from 'vitest';
import { tasksDoneFromEvents } from '../lib/gameLog';
import type { Task } from '../api/types';

const task = (id: string, requires: string[] = []): Task => ({
  id,
  name: id,
  normalizedName: id,
  trader: 't',
  minPlayerLevel: 1,
  factionName: 'Any',
  kappaRequired: false,
  lightkeeperRequired: false,
  wikiLink: null,
  map: null,
  taskRequirements: requires.map((r) => ({ task: r, status: ['complete'] })),
  neededKeys: [],
  objectives: [],
});

// a -> b -> c: c needs b, b needs a. d needs a only to be active (not complete).
const tasks = new Map(
  [task('a'), task('b', ['a']), task('c', ['b']), { ...task('d'), taskRequirements: [{ task: 'a', status: ['active'] }] }].map((t) => [t.id, t]),
);

describe('tasksDoneFromEvents', () => {
  it('marks a completed task and its whole prerequisite chain', () => {
    const done = tasksDoneFromEvents([{ kind: 'quest', status: 'completed', questId: 'c', time: 0 }], tasks);
    expect([...done].sort()).toEqual(['a', 'b', 'c']);
  });

  it('marks only the prerequisites of a started task', () => {
    const done = tasksDoneFromEvents([{ kind: 'quest', status: 'started', questId: 'c', time: 0 }], tasks);
    expect([...done].sort()).toEqual(['a', 'b']);
  });

  it('ignores failed tasks, unknown ids and requirements that only need a task active', () => {
    const done = tasksDoneFromEvents(
      [
        { kind: 'quest', status: 'failed', questId: 'b', time: 0 },
        { kind: 'quest', status: 'started', questId: 'zzz', time: 0 },
        { kind: 'quest', status: 'started', questId: 'd', time: 0 },
      ],
      tasks,
    );
    expect([...done]).toEqual([]);
  });
});
