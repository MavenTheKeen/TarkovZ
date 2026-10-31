import type { GameMap, Task } from '../api/types';
import ObjectiveRow from './ObjectiveRow';
import { isTaskAvailable, questsOnMap, type Feature, type Lookups } from '../lib/mapFeatures';
import { toggleTask, useProgress } from '../lib/progress';
import { useSettings } from '../lib/settings';
import type { GamePoint } from '../lib/projection';

interface MapQuestsPanelProps {
  map: GameMap;
  tasks: Task[];
  features: Feature[];
  lookups: Lookups;
  onFocus: (points: GamePoint[]) => void;
}

/** Unfinished quests with objectives on the current map. */
export default function MapQuestsPanel({ map, tasks, features, lookups, onFocus }: MapQuestsPanelProps) {
  const { gameMode: mode, faction, playerLevel } = useSettings();
  const progress = useProgress(mode);
  // Quests you can take now first; the rest are dimmed below them.
  const quests = questsOnMap(map, tasks, progress, faction)
    .map((q) => ({ ...q, available: isTaskAvailable(q.task, progress, playerLevel) }))
    .sort((a, b) => Number(b.available) - Number(a.available));
  const pointsFor = (pred: (f: Feature) => boolean) => features.filter(pred).map((f) => f.position);

  if (!tasks.length) return <p className="note">Loading quests…</p>;
  if (!quests.length) return <p className="note">No unfinished quests on {map.name}.</p>;

  return (
    <ul className="card-list">
      {quests.map(({ task, placed, unplaced, available }) => {
        const taskPoints = pointsFor((f) => f.questId === task.id);
        return (
          <li key={task.id} className={`card${available ? '' : ' dim'}`}>
            <button
              type="button"
              className="card-title link"
              disabled={!taskPoints.length}
              onClick={() => onFocus(taskPoints)}
            >
              {task.name}
            </button>
            <div className="card-kind">
              {lookups.traders.get(task.trader)?.name ?? 'Trader'}
              {task.minPlayerLevel > 1 ? ` · Level ${task.minPlayerLevel}` : ''}
              {!available && ' · locked'}
              {task.kappaRequired && <span className="badge">Kappa</span>}
            </div>
            <ul className="objectives">
              {placed.map((o) => (
                <ObjectiveRow
                  key={o.id}
                  objective={o}
                  mode={mode}
                  done={false}
                  onShow={() => onFocus(pointsFor((f) => f.objectiveId === o.id))}
                />
              ))}
            </ul>
            {unplaced.length > 0 && (
              <>
                <div className="subhead">No marker in the data</div>
                <ul className="objectives">
                  {unplaced.map((o) => (
                    <ObjectiveRow key={o.id} objective={o} mode={mode} done={false} />
                  ))}
                </ul>
              </>
            )}
            <div className="card-actions">
              <button type="button" onClick={() => toggleTask(mode, task.id)}>
                Mark task done
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
