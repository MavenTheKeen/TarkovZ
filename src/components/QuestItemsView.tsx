import { useMemo, useState } from 'react';
import type { Item, Task } from '../api/types';
import { bestTraderSell, formatRub } from '../lib/pricing';
import type { Progress } from '../lib/progress';
import { questItemNeeds, setCollected, useCollected, type QuestUse } from '../lib/questNeeds';
import { useSettings } from '../lib/settings';

type Scope = 'all' | 'locked' | 'available';
const SCOPE_LABELS: Record<Scope, string> = { all: 'All unfinished', locked: 'Locked quests', available: 'Available now' };
type Sort = 'count' | 'level' | 'name';

/** Quest names shown on a row before "+N more". */
const MAX_QUESTS = 3;

interface QuestItemsViewProps {
  tasks: Task[];
  progress: Progress;
  items: Map<string, Item>;
}

/** Every item your unfinished quests need, with a "have" counter for each. */
export default function QuestItemsView({ tasks, progress, items }: QuestItemsViewProps) {
  const settings = useSettings();
  const mode = settings.gameMode;
  const collected = useCollected(mode);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [firOnly, setFirOnly] = useState(false);
  const [kappaOnly, setKappaOnly] = useState(false);
  const [hideCollected, setHideCollected] = useState(true);
  const [sort, setSort] = useState<Sort>('count');

  const needs = useMemo(
    () => questItemNeeds(tasks, progress, settings.playerLevel, settings.faction),
    [tasks, progress, settings.playerLevel, settings.faction],
  );

  const q = query.trim().toLowerCase();
  const rows = needs
    .map((need) => {
      // Totals count only the quests that pass the filters.
      const quests = need.quests.filter(
        (u) =>
          (scope === 'all' || (scope === 'locked') === u.locked) &&
          (!firOnly || u.foundInRaid) &&
          (!kappaOnly || u.task.kappaRequired),
      );
      const total = quests.reduce((n, u) => n + u.count, 0);
      const fir = quests.reduce((n, u) => n + (u.foundInRaid ? u.count : 0), 0);
      const minLevel = Math.min(...quests.map((u) => u.task.minPlayerLevel));
      return { item: items.get(need.itemId), itemId: need.itemId, quests, total, fir, minLevel, have: collected[need.itemId] ?? 0 };
    })
    .filter((r): r is typeof r & { item: Item } => !!r.item && r.total > 0)
    .filter((r) => !hideCollected || r.have < r.total)
    .filter((r) => !q || r.item.name.toLowerCase().includes(q) || r.item.shortName.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'name'
        ? a.item.name.localeCompare(b.item.name)
        : sort === 'level'
          ? a.minLevel - b.minLevel || a.item.name.localeCompare(b.item.name)
          : b.total - a.total || a.item.name.localeCompare(b.item.name),
    );

  const totalItems = rows.reduce((n, r) => n + r.total, 0);

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented small" role="group" aria-label="Which quests">
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <button key={s} type="button" className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="chips">
          <button type="button" className={`chip${firOnly ? ' on' : ''}`} onClick={() => setFirOnly((v) => !v)}>
            Found in raid
          </button>
          <button type="button" className={`chip${kappaOnly ? ' on' : ''}`} onClick={() => setKappaOnly((v) => !v)}>
            Kappa
          </button>
          <button type="button" className={`chip${hideCollected ? ' on' : ''}`} onClick={() => setHideCollected((v) => !v)}>
            Hide collected
          </button>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="count">Most needed</option>
          <option value="level">Soonest quests</option>
          <option value="name">Name</option>
        </select>
      </div>
      <p className="muted small">
        {rows.length} items, {totalItems.toLocaleString('en-US')} in all. Counts update as you tick quests done; use − and + to
        track what you've put aside.
      </p>

      <ul className="need-list">
        {rows.map((r) => (
          <li key={r.itemId} className={r.have >= r.total ? 'done' : ''}>
            {r.item.iconLink && <img src={r.item.iconLink} alt="" width={40} height={40} loading="lazy" />}
            <div className="need-main">
              <div className="need-name">
                {r.item.name}
                {r.fir > 0 && (
                  <span className="badge" title={`${r.fir === r.total ? 'All' : `${r.fir} of ${r.total}`} must be found in raid`}>
                    FIR {r.fir < r.total ? r.fir : ''}
                  </span>
                )}
              </div>
              <div className="muted small">
                {r.quests.slice(0, MAX_QUESTS).map((u, i) => (
                  <span key={`${u.task.id}-${u.use}-${i}`}>
                    {i > 0 && ' · '}
                    <QuestRef use={u} />
                  </span>
                ))}
                {r.quests.length > MAX_QUESTS && (
                  <span title={r.quests.slice(MAX_QUESTS).map((u) => u.task.name).join(', ')}>
                    {' '}
                    · +{r.quests.length - MAX_QUESTS} more
                  </span>
                )}
              </div>
            </div>
            <span className="item-price">{formatRub(r.item.avg24hPrice ?? bestTraderSell(r.item)?.priceRUB)}</span>
            <div className="counter" aria-label={`${r.have} of ${r.total} collected`}>
              <button type="button" className="mini" onClick={() => setCollected(mode, r.itemId, r.have - 1)} disabled={!r.have}>
                −
              </button>
              <input
                type="number"
                min={0}
                max={r.total}
                value={r.have}
                aria-label={`${r.item.name} collected`}
                onChange={(e) => setCollected(mode, r.itemId, Math.min(r.total, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
              />
              <span className="muted">/ {r.total.toLocaleString('en-US')}</span>
              <button type="button" className="mini" onClick={() => setCollected(mode, r.itemId, Math.min(r.total, r.have + 1))}>
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="note">Nothing left to collect for these quests.</p>}
    </>
  );
}

function QuestRef({ use }: { use: QuestUse }) {
  return (
    <span className={use.locked ? 'locked' : ''} title={use.locked ? "You can't take this quest yet" : undefined}>
      {use.task.name} ×{use.count}
      {use.use === 'bring' ? ' (bring)' : ''}
      {use.locked && use.task.minPlayerLevel > 1 ? ` · Lv ${use.task.minPlayerLevel}` : ''}
      {use.locked ? ' 🔒' : ''}
    </span>
  );
}
