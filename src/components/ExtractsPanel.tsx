import type { GameMap } from '../api/types';
import { distance2d } from '../lib/geometry';
import {
  extractRequirement,
  factionLabel,
  itemName,
  playerSpawns,
  rankExtracts,
  type Lookups,
} from '../lib/mapFeatures';
import { ROUBLES_ID } from '../lib/pricing';
import type { GamePoint } from '../lib/projection';
import { updateSettings, useSettings } from '../lib/settings';
import { setExtractNote, toggleOwnedItem, useExtractNotes, useOwnedItems } from '../lib/userData';

interface ExtractsPanelProps {
  map: GameMap;
  lookups: Lookups;
  you: GamePoint | null;
  onSetPosition: (p: GamePoint | null) => void;
  onFocus: (p: GamePoint) => void;
}

const xz = (p: { x: number; z: number }): GamePoint => ({ x: p.x, z: p.z });

/** Extraction guide: where can I leave from, and can I use it? */
export default function ExtractsPanel({ map, lookups, you, onSetPosition, onFocus }: ExtractsPanelProps) {
  const { side } = useSettings();
  const owned = useOwnedItems();
  const notes = useExtractNotes();
  const spawns = playerSpawns(map, side);
  // Without a position, list by name; usable extracts still come first.
  const ranked = rankExtracts(map, you ?? { x: 0, z: 0 }, side, owned);
  if (!you) ranked.sort((a, b) => Number(b.usable) - Number(a.usable) || a.extract.name.localeCompare(b.extract.name));

  const spawnIndex = you ? spawns.findIndex(({ spawn }) => spawn.position.x === you.x && spawn.position.z === you.z) : -1;

  return (
    <div className="extracts">
      <div className="row">
        <div className="segmented" role="group" aria-label="Side">
          {(['pmc', 'scav'] as const).map((s) => (
            <button key={s} type="button" className={side === s ? 'active' : ''} onClick={() => updateSettings({ side: s })}>
              {s === 'pmc' ? 'PMC' : 'Scav'}
            </button>
          ))}
        </div>
        <select
          value={spawnIndex >= 0 ? String(spawnIndex) : ''}
          onChange={(e) => {
            const pick = spawns[Number(e.target.value)];
            onSetPosition(pick ? xz(pick.spawn.position) : null);
          }}
          aria-label="Where you spawned"
        >
          <option value="">{you && spawnIndex < 0 ? 'Spot picked on map' : 'Where did you spawn?'}</option>
          {spawns.map(({ spawn }, i) => (
            <option key={i} value={i}>
              {spawn.label} ({spawn.position.x.toFixed(0)}, {spawn.position.z.toFixed(0)})
            </option>
          ))}
        </select>
      </div>
      {you && (
        <button type="button" className="link-button" onClick={() => onSetPosition(null)}>
          Clear my pin
        </button>
      )}
      <p className="hint">
        {you
          ? 'Ranked by straight-line distance, an estimate that ignores walls and terrain.'
          : 'Pick your spawn above, or right-click the map where you spawned, to rank extracts by distance.'}{' '}
        The data says what an extract needs, not whether it's open in your raid.
      </p>

      <ul className="card-list">
        {ranked.map(({ extract, distance, usable, reason }) => {
          const item = extract.transferItem?.item;
          return (
            <li key={extract.id} className={`card extract-card${usable ? '' : ' dim'}`}>
              <button type="button" className="card-title link" onClick={() => onFocus(xz(extract.position))}>
                {extract.name}
              </button>
              <div className="card-kind">
                <span className={`badge faction-${extract.faction ?? 'shared'}`}>{factionLabel(extract.faction)}</span>
                {you && <span className="distance">~{Math.round(distance)} m</span>}
              </div>
              <div className="card-detail">{extractRequirement(extract, map, lookups)}</div>
              {!usable && reason && <div className="card-detail warn">{reason}</div>}
              {item && item !== ROUBLES_ID && (
                <label className="check">
                  <input type="checkbox" checked={!!owned[item]} onChange={() => toggleOwnedItem(item)} />
                  I'm carrying {itemName(item, lookups)}
                </label>
              )}
              <input
                className="note-input"
                placeholder="Your note (e.g. campers here)"
                value={notes[extract.id] ?? ''}
                onChange={(e) => setExtractNote(extract.id, e.target.value)}
              />
            </li>
          );
        })}
      </ul>

      {map.transits.length > 0 && (
        <>
          <h3>Transits</h3>
          <ul className="card-list">
            {map.transits
              .map((t) => ({ t, d: you ? distance2d(you, xz(t.position)) : 0 }))
              .sort((a, b) => a.d - b.d)
              .map(({ t, d }) => (
                <li key={t.id} className="card">
                  <button type="button" className="card-title link" onClick={() => onFocus(xz(t.position))}>
                    {t.description || 'Transit'}
                  </button>
                  <div className="card-kind">
                    To {lookups.maps.get(t.map)?.name ?? 'another map'}
                    {you && <span className="distance">~{Math.round(d)} m</span>}
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
