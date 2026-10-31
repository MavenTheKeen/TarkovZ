import { useMemo, useState } from 'react';
import { useLookups } from '../api/data';
import type { Task } from '../api/types';
import ObjectiveRow from '../components/ObjectiveRow';
import { isTaskAvailable, isTaskForFaction, objectiveIsOnMap, objectiveTargets, type Lookups } from '../lib/mapFeatures';
import { showOnMap } from '../lib/nav';
import { toggleTask, useProgress, type Progress } from '../lib/progress';
import { requiredItems } from '../lib/questItems';
import { useSettings } from '../lib/settings';
import type { GamePoint } from '../lib/projection';

/** Every map a task has markers on, with the points to jump to. */
function taskMapPoints(task: Task): Map<string, GamePoint[]> {
  const out = new Map<string, GamePoint[]>();
  for (const o of task.objectives) {
    for (const { mapId, points } of objectiveTargets(o)) out.set(mapId, [...(out.get(mapId) ?? []), ...points]);
  }
  return out;
}

/** Long map lists ("Woods, Customs, Shoreline, …") are cut to this many names. */
const MAX_MAP_NAMES = 2;

export default function QuestsScreen() {
  const settings = useSettings();
  const mode = settings.gameMode;
  const { tasks, maps, lookups } = useLookups(mode);
  const progress = useProgress(mode);

  const [trader, setTrader] = useState('');
  const [mapId, setMapId] = useState('');
  const [query, setQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [atMyLevel, setAtMyLevel] = useState(true);
  const [kappaOnly, setKappaOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const all = tasks.data?.data.tasks ?? [];
  const traderIds = useMemo(() => [...new Set(all.map((t) => t.trader))], [all]);

  const q = query.trim().toLowerCase();
  const filtered = all
    .filter((t) => isTaskForFaction(t, settings.faction))
    .filter((t) => !trader || t.trader === trader)
    .filter((t) => !mapId || t.map === mapId || t.objectives.some((o) => objectiveIsOnMap(o, mapId)))
    .filter((t) => !hideCompleted || !progress.tasks[t.id])
    .filter((t) => !atMyLevel || isTaskAvailable(t, progress, settings.playerLevel))
    .filter((t) => !kappaOnly || t.kappaRequired)
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => a.minPlayerLevel - b.minPlayerLevel || a.name.localeCompare(b.name));

  const doneCount = all.filter((t) => progress.tasks[t.id]).length;

  return (
    <div className="screen">
      <div className="filters">
        <input type="search" placeholder="Search quests" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={trader} onChange={(e) => setTrader(e.target.value)} aria-label="Trader">
          <option value="">All traders</option>
          {traderIds
            .map((id) => ({ id, name: lookups.traders.get(id)?.name ?? id }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <select value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
          <option value="">All maps</option>
          {(maps.data?.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="chips">
          <button type="button" className={`chip${atMyLevel ? ' on' : ''}`} onClick={() => setAtMyLevel((v) => !v)} title={`Prerequisites done and level ${settings.playerLevel} or below (set your level in Settings)`}>
            Available now
          </button>
          <button type="button" className={`chip${kappaOnly ? ' on' : ''}`} onClick={() => setKappaOnly((v) => !v)}>
            Kappa
          </button>
          <button type="button" className={`chip${hideCompleted ? ' on' : ''}`} onClick={() => setHideCompleted((v) => !v)}>
            Hide done
          </button>
        </div>
      </div>

      {tasks.isPending && <p className="note">Loading quests…</p>}
      {tasks.error && !tasks.data && <p className="note error">Couldn't load quests. ({tasks.error.message})</p>}
      {tasks.data && (
        <div className="progress-line">
          <div className="progress-bar">
            <span style={{ width: `${(doneCount / Math.max(1, all.length)) * 100}%` }} />
          </div>
          <span className="muted small">
            {doneCount} of {all.length} done · {filtered.length} shown
          </span>
        </div>
      )}

      <ul className="task-list">
        {filtered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            progress={progress}
            lookups={lookups}
            expanded={expanded === task.id}
            onToggleExpand={() => setExpanded((id) => (id === task.id ? null : task.id))}
          />
        ))}
      </ul>
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  progress: Progress;
  lookups: Lookups & { tasks: Map<string, Task> };
  expanded: boolean;
  onToggleExpand: () => void;
}

function TaskRow({ task, progress, lookups, expanded, onToggleExpand }: TaskRowProps) {
  const { gameMode: mode } = useSettings();
  const done = !!progress.tasks[task.id];
  const mapPoints = taskMapPoints(task);
  const mapNames = [...new Set([task.map, ...task.objectives.flatMap((o) => o.maps)].filter(Boolean) as string[])]
    .map((id) => lookups.maps.get(id)?.name)
    .filter(Boolean);
  const items = expanded ? requiredItems(task, lookups) : null;

  return (
    <li className={`task${done ? ' done' : ''}`}>
      <div className="task-head">
        <input type="checkbox" checked={done} onChange={() => toggleTask(mode, task.id)} aria-label="Task done" />
        <button type="button" className="task-name" onClick={onToggleExpand}>
          {task.name}
        </button>
        <span className="muted small" title={mapNames.length > MAX_MAP_NAMES ? mapNames.join(', ') : undefined}>
          {lookups.traders.get(task.trader)?.name}
          {task.minPlayerLevel > 1 ? ` · Lv ${task.minPlayerLevel}` : ''}
          {mapNames.length ? ` · ${mapNames.slice(0, MAX_MAP_NAMES).join(', ')}` : ''}
          {mapNames.length > MAX_MAP_NAMES ? ` +${mapNames.length - MAX_MAP_NAMES}` : ''}
        </span>
        {task.kappaRequired && <span className="badge">Kappa</span>}
      </div>

      {expanded && items && (
        <div className="task-body">
          <ul className="objectives">
            {task.objectives.map((o) => {
              const target = objectiveTargets(o)[0];
              return (
                <ObjectiveRow
                  key={o.id}
                  objective={o}
                  mode={mode}
                  done={done || !!progress.objectives[o.id]}
                  onShow={target ? () => showOnMap({ ...target, questId: task.id }) : undefined}
                />
              );
            })}
          </ul>

          {(items.bring.length > 0 || items.handIn.length > 0) && (
            <div className="req-items">
              {items.bring.length > 0 && (
                <div>
                  <div className="subhead">Bring into raid</div>
                  <ul>
                    {items.bring.map((it, i) => (
                      <li key={i}>
                        {it.count} × {it.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {items.handIn.length > 0 && (
                <div>
                  <div className="subhead">Hand in</div>
                  <ul>
                    {items.handIn.map((it, i) => (
                      <li key={i}>
                        {it.count} × {it.label}
                        {it.foundInRaid && <span className="badge">FIR</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {task.taskRequirements.length > 0 && (
            <div className="muted small">
              Requires:{' '}
              {task.taskRequirements
                .map((r) => `${lookups.tasks.get(r.task)?.name ?? 'Unknown task'}${progress.tasks[r.task] ? ' ✓' : ''}`)
                .join(', ')}
            </div>
          )}

          <div className="card-actions">
            {[...mapPoints.entries()].map(([id, points]) => (
              <button key={id} type="button" onClick={() => showOnMap({ mapId: id, points, questId: task.id })}>
                Show on {lookups.maps.get(id)?.name ?? 'map'}
              </button>
            ))}
            {task.wikiLink && (
              <a href={task.wikiLink} target="_blank" rel="noreferrer">
                Wiki
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
