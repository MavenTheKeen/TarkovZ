import type { GameMode, Objective } from '../api/types';
import { toggleObjective } from '../lib/progress';

interface ObjectiveRowProps {
  objective: Objective;
  mode: GameMode;
  done: boolean;
  /** Shown when the objective has markers to jump to. */
  onShow?: () => void;
}

export default function ObjectiveRow({ objective, mode, done, onShow }: ObjectiveRowProps) {
  return (
    <li className={`objective${done ? ' done' : ''}`}>
      <label className="check">
        <input type="checkbox" checked={done} onChange={() => toggleObjective(mode, objective.id)} />
        <span>
          {objective.optional && <span className="badge">Optional</span>} {objective.description}
        </span>
      </label>
      {onShow && (
        <button type="button" className="mini" onClick={onShow} title="Show on map">
          ◎
        </button>
      )}
    </li>
  );
}
