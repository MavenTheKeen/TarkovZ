import type { GameMode } from '../api/types';
import type { GamePoint } from '../lib/projection';
import { toggleObjective, useProgress } from '../lib/progress';
import { useExtractNotes } from '../lib/userData';
import type { HereState } from '../screens/MapScreen';

interface HerePanelProps {
  here: HereState | null;
  mode: GameMode;
  onSetPosition: (p: GamePoint) => void;
  onShowQuest: (questId: string) => void;
}

/** "What is here": everything at the spot that was clicked. */
export default function HerePanel({ here, mode, onSetPosition, onShowQuest }: HerePanelProps) {
  const progress = useProgress(mode);
  const notes = useExtractNotes();

  if (!here) {
    return <p className="note">Click any marker, area or empty spot on the map to see what's there.</p>;
  }

  return (
    <div className="here">
      <div className="here-head">
        <span className="muted">
          x {here.point.x.toFixed(0)}, z {here.point.z.toFixed(0)}
        </span>
        <button type="button" onClick={() => onSetPosition(here.point)}>
          I'm here: rank extracts
        </button>
      </div>
      {here.features.length === 0 && <p className="note">Nothing marked at this spot.</p>}
      <ul className="card-list">
        {here.features.map((f) => (
          <li key={f.id} className={`card kind-${f.kind}`}>
            <div className="card-title">{f.title}</div>
            {f.details.map((d, i) => (
              <div key={i} className={i === 0 ? 'card-kind' : 'card-detail'}>
                {d}
              </div>
            ))}
            {f.extractId && notes[f.extractId] && <div className="card-note">Note: {notes[f.extractId]}</div>}
            <div className="card-actions">
              {f.kind === 'spawn' && (
                <button type="button" onClick={() => onSetPosition(f.position)}>
                  I spawned here
                </button>
              )}
              {f.questId && (
                <button type="button" onClick={() => onShowQuest(f.questId!)}>
                  Show quest
                </button>
              )}
              {f.objectiveId && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!progress.objectives[f.objectiveId]}
                    onChange={() => toggleObjective(mode, f.objectiveId!)}
                  />
                  Objective done
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
