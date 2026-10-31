import { useMemo, useState } from 'react';
import { useHideout, useLookups } from '../api/data';
import type { HideoutStation, Item } from '../api/types';
import { canBuildNext, setHideoutLevel, upcomingLevels, useHideoutLevels } from '../lib/hideout';
import { formatRub, ROUBLES_ID } from '../lib/pricing';
import { useSettings } from '../lib/settings';

interface ShoppingLine {
  item: Item | undefined;
  itemId: string;
  count: number;
  fir: number;
  for: string[];
}

export default function HideoutScreen() {
  const { gameMode: mode } = useSettings();
  const hideout = useHideout(mode);
  const { lookups } = useLookups(mode);
  const levels = useHideoutLevels(mode);
  const [scope, setScope] = useState<'next' | 'all'>('next');

  const stations = hideout.data?.data ?? [];

  const shopping = useMemo(() => {
    const upcoming = upcomingLevels(stations, levels).filter(
      ({ station, level }) => scope === 'all' || level.level === (levels[station.id] ?? 0) + 1,
    );
    const lines = new Map<string, ShoppingLine>();
    for (const { station, level } of upcoming) {
      for (const r of level.itemRequirements) {
        const line = lines.get(r.item) ?? { item: lookups.items.get(r.item), itemId: r.item, count: 0, fir: 0, for: [] };
        line.count += r.count;
        if (r.foundInRaid) line.fir += r.count;
        line.for.push(`${station.name} ${level.level}`);
        lines.set(r.item, line);
      }
    }
    // Roubles last; otherwise most-needed first.
    return [...lines.values()].sort(
      (a, b) => Number(a.itemId === ROUBLES_ID) - Number(b.itemId === ROUBLES_ID) || b.count - a.count,
    );
  }, [stations, levels, scope, lookups.items]);

  const built = stations.reduce((n, s) => n + (levels[s.id] ?? 0), 0);
  const total = stations.reduce((n, s) => n + s.levels.length, 0);

  return (
    <div className="screen split">
      <div className="split-list wide">
        <div className="section-head">
          <h2>Stations</h2>
          <span className="muted small">
            {built} of {total} levels built
          </span>
        </div>
        {hideout.isPending && <p className="note">Loading hideout…</p>}
        {hideout.error && !hideout.data && <p className="note error">Couldn't load the hideout. ({hideout.error.message})</p>}
        <ul className="station-list">
          {stations.map((s) => (
            <StationRow key={s.id} station={s} levels={levels} ready={canBuildNext(s, levels)} stationsById={hideout.data!.byId} />
          ))}
        </ul>
      </div>

      <div className="split-detail">
        <div className="section-head">
          <h2>Shopping list</h2>
          <div className="segmented small" role="group" aria-label="Which levels">
            <button type="button" className={scope === 'next' ? 'active' : ''} onClick={() => setScope('next')}>
              Next levels
            </button>
            <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
              Everything left
            </button>
          </div>
        </div>
        {shopping.length === 0 && stations.length > 0 && <p className="note">Nothing left to build. Nice.</p>}
        <table className="list-table">
          <tbody>
            {shopping.map((line) => (
              <tr key={line.itemId}>
                <td className="icon-cell">
                  {line.item?.iconLink && <img src={line.item.iconLink} alt="" width={28} height={28} loading="lazy" />}
                </td>
                <td>
                  <div>{line.item?.name ?? 'Unknown item'}</div>
                  <div className="muted small">{line.for.join(' · ')}</div>
                </td>
                <td className="num">
                  ×{line.count.toLocaleString('en-US')}
                  {line.fir > 0 && <span className="badge" title="Must be found in raid">FIR {line.fir}</span>}
                </td>
                <td className="num muted small">
                  {line.itemId === ROUBLES_ID ? '' : formatRub(line.item?.avg24hPrice ? line.item.avg24hPrice * line.count : null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StationRow({
  station,
  levels,
  ready,
  stationsById,
}: {
  station: HideoutStation;
  levels: Record<string, number>;
  ready: boolean;
  stationsById: Map<string, HideoutStation>;
}) {
  const { gameMode: mode } = useSettings();
  const level = levels[station.id] ?? 0;
  const max = station.levels.length;
  const next = station.levels.find((l) => l.level === level + 1);
  const blockers = next?.stationLevelRequirements.filter((r) => (levels[r.station] ?? 0) < r.level) ?? [];

  return (
    <li className="station">
      <div className="station-head">
        <span className="station-name">{station.name}</span>
        <div className="level-pips" role="group" aria-label={`${station.name} level`}>
          {Array.from({ length: max + 1 }, (_, l) => (
            <button
              key={l}
              type="button"
              className={l <= level ? 'on' : ''}
              title={l === 0 ? 'Not built' : `Level ${l}`}
              onClick={() => setHideoutLevel(mode, station.id, l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="muted small">
        {level >= max
          ? 'Fully upgraded'
          : ready
            ? `Level ${level + 1} can be built once you have the items`
            : `Level ${level + 1} needs ${blockers.map((r) => `${stationsById.get(r.station)?.name ?? 'a station'} ${r.level}`).join(', ')}`}
      </div>
    </li>
  );
}
