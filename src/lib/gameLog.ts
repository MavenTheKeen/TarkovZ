import { useEffect, useRef } from 'react';
import type { GameMap, Task } from '../api/types';
import { createStore, useStore } from './store';
import { markTasksDone } from './progress';
import { showOnMap } from './nav';
import { startRaid, stopRaid } from './raidTimer';
import { settingsStore, type Settings } from './settings';

type QuestEvent = Extract<GameLogEvent, { kind: 'quest' }>;

/** Raid start lines also appear outside raids, so only trust one soon after a raid map loads. */
const RAID_MAP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Tasks to mark done from quest events: each completed task, and the
 * prerequisites of every task that was started or completed (you can't start
 * a task without finishing them).
 */
export function tasksDoneFromEvents(events: QuestEvent[], tasksById: Map<string, Task>): Set<string> {
  const done = new Set<string>();
  const addWithPrereqs = (id: string, includeSelf: boolean) => {
    if (includeSelf) done.add(id);
    for (const r of tasksById.get(id)?.taskRequirements ?? []) {
      if (r.status.includes('complete') && !done.has(r.task)) addWithPrereqs(r.task, true);
    }
  };
  for (const e of events) {
    if (!tasksById.has(e.questId)) continue;
    if (e.status === 'completed') addWithPrereqs(e.questId, true);
    else if (e.status === 'started') addWithPrereqs(e.questId, false);
  }
  return done;
}

export interface GameLogState {
  status: GameLogStatus | null;
  error: string | null;
  /** Short description of the last thing read from the logs. */
  last: string | null;
}

export const gameLogStore = createStore<GameLogState>(null, { status: null, error: null, last: null });
export const useGameLogState = () => useStore(gameLogStore);

// Small, auto-dismissing notices for things the app did on its own.
export interface Toast {
  id: number;
  text: string;
}
export const toastStore = createStore<Toast[]>(null, []);
let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  toastStore.set((t) => [...t.slice(-3), { id, text }]);
  setTimeout(() => toastStore.set((t) => t.filter((x) => x.id !== id)), 6000);
}

/**
 * Imports every quest finished or started in past sessions (since a date, to
 * skip a previous wipe). Returns how many tasks were newly marked done.
 */
export async function importHistory(settings: Settings, tasksById: Map<string, Task>, since = 0): Promise<number> {
  const bridge = window.desktop?.gameLog;
  if (!bridge) throw new Error('Only available in the desktop app');
  const events = await bridge.history(settings.gameLog.folder, since);
  const done = tasksDoneFromEvents(events, tasksById);
  return markTasksDone(settings.gameMode, done);
}

/**
 * Watches the game logs while enabled and applies what it reads: ticks quests,
 * switches to the raid's map and runs the raid timer. Mount once, at the top.
 */
export function useGameLogWatcher(settings: Settings, tasksById: Map<string, Task>, maps: GameMap[]) {
  // Event handlers read the latest data through refs, so the watcher isn't restarted on every data change.
  const latest = useRef({ settings, tasksById, maps });
  latest.current = { settings, tasksById, maps };
  const raidMap = useRef<{ map: GameMap; time: number } | null>(null);

  const { enabled, folder } = settings.gameLog;
  useEffect(() => {
    const bridge = window.desktop?.gameLog;
    if (!bridge || !enabled) {
      bridge?.stop().catch(() => undefined);
      gameLogStore.set((s) => ({ ...s, status: null, error: null }));
      return;
    }

    let active = true;
    bridge
      .start(folder)
      .then((status) => {
        if (!active) return;
        gameLogStore.set((s) => ({
          ...s,
          status,
          error: status.logsDir ? null : "Couldn't find the Escape from Tarkov Logs folder. Choose it in Settings.",
        }));
      })
      .catch((err: Error) => active && gameLogStore.set((s) => ({ ...s, error: err.message })));

    const off = bridge.onEvent((event) => {
      const { settings: s, tasksById: tasks, maps: mapList } = latest.current;
      const opts = s.gameLog;
      const note = (last: string) => gameLogStore.set((st) => ({ ...st, last }));

      if (event.kind === 'session') {
        gameLogStore.set((st) => ({ ...st, status: st.status && { ...st.status, session: event.session } }));
      } else if (event.kind === 'quest') {
        const task = tasks.get(event.questId);
        if (!task) return;
        note(`${task.name} ${event.status}`);
        if (!opts.autoQuests) return;
        const added = markTasksDone(s.gameMode, tasksDoneFromEvents([event], tasks));
        if (event.status === 'completed' && added) toast(`✓ ${task.name} completed`);
      } else if (event.kind === 'raid-map') {
        const map = mapList.find((m) => m.nameId.toLowerCase() === event.nameId.toLowerCase());
        if (!map) return;
        raidMap.current = { map, time: event.time };
        note(`Loading into ${map.name}`);
        if (opts.autoMap) showOnMap({ mapId: map.id, points: [] });
      } else if (event.kind === 'raid-start') {
        const pending = raidMap.current;
        if (!pending || event.time - pending.time > RAID_MAP_WINDOW_MS) return;
        raidMap.current = null;
        note(`Raid started on ${pending.map.name}`);
        if (opts.autoTimer) {
          startRaid({ mapId: pending.map.id, mapName: pending.map.name, minutes: pending.map.raidDuration ?? 40 });
          toast(`Raid timer started: ${pending.map.name}`);
        }
      } else if (event.kind === 'raid-end') {
        note('Raid ended');
        if (opts.autoTimer) stopRaid();
      }
    });

    return () => {
      active = false;
      off();
    };
  }, [enabled, folder]);
}

/** Lets the settings UI change log options. */
export function updateGameLog(patch: Partial<Settings['gameLog']>) {
  settingsStore.set((s) => ({ ...s, gameLog: { ...s.gameLog, ...patch } }));
}
