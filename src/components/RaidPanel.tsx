import type { GameMap } from '../api/types';
import type { GamePoint } from '../lib/projection';
import { formatClock, startRaid, stopRaid, useRaidTimer, useSecondsLeft } from '../lib/raidTimer';

interface RaidPanelProps {
  map: GameMap;
  onFocus: (points: GamePoint[]) => void;
}

/** Map overview and a raid timer. */
export default function RaidPanel({ map, onFocus }: RaidPanelProps) {
  const timer = useRaidTimer();
  const secondsLeft = useSecondsLeft(timer);
  const running = timer?.mapId === map.id;
  const minutes = map.raidDuration ?? 40;

  // One entry per boss, with every spawn location merged.
  const bosses = new Map<string, { name: string; chance: number; where: string[]; points: GamePoint[] }>();
  for (const b of map.bosses) {
    const entry = bosses.get(b.id) ?? { name: b.name, chance: 0, where: [], points: [] };
    entry.chance = Math.max(entry.chance, b.spawnChance);
    for (const loc of b.locations) {
      if (!entry.where.includes(loc.name)) entry.where.push(loc.name);
      entry.points.push(...loc.positions.map((p) => ({ x: p.x, z: p.z, y: p.y })));
    }
    bosses.set(b.id, entry);
  }

  return (
    <div className="raid">
      <div className={`raid-timer${running && secondsLeft !== null && secondsLeft < 300 ? ' urgent' : ''}`}>
        {running && secondsLeft !== null ? (
          <>
            <div className="clock">{formatClock(secondsLeft)}</div>
            <div className="muted small">{secondsLeft > 0 ? 'left in raid' : 'raid time is up'}</div>
            <button type="button" onClick={stopRaid}>
              End raid
            </button>
          </>
        ) : (
          <>
            <div className="clock muted">{minutes}:00</div>
            {timer && <div className="muted small">A raid on {timer.mapName} is running.</div>}
            <button type="button" className="primary" onClick={() => startRaid({ mapId: map.id, mapName: map.name, minutes })}>
              Start raid timer
            </button>
          </>
        )}
      </div>

      <dl className="facts">
        <dt>Raid</dt>
        <dd>{minutes} min</dd>
        {map.players && (
          <>
            <dt>Players</dt>
            <dd>{map.players}</dd>
          </>
        )}
        {map.enemies.length > 0 && (
          <>
            <dt>Enemies</dt>
            <dd>{map.enemies.join(', ')}</dd>
          </>
        )}
      </dl>

      {bosses.size > 0 && (
        <>
          <div className="subhead">Bosses</div>
          <ul className="card-list">
            {[...bosses.values()]
              .sort((a, b) => b.chance - a.chance)
              .map((b) => (
                <li key={b.name} className="card kind-boss">
                  <button
                    type="button"
                    className="card-title link"
                    disabled={!b.points.length}
                    onClick={() => onFocus(b.points)}
                  >
                    {b.name}
                  </button>
                  <div className="card-kind">
                    <span className="chance">{Math.round(b.chance * 100)}%</span>
                    {b.where.join(', ')}
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
      {map.wiki && (
        <a className="small" href={map.wiki} target="_blank" rel="noreferrer">
          {map.name} on the wiki
        </a>
      )}
    </div>
  );
}
