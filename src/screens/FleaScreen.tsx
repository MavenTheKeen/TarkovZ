import { useMemo, useState } from 'react';
import { useHideout, useLookups } from '../api/data';
import type { Item, ItemsFeed, Trader } from '../api/types';
import { useHideoutLevels } from '../lib/hideout';
import { buildNeedsIndex, totalNeeded, type ItemNeed } from '../lib/needs';
import { useProgress } from '../lib/progress';
import { CURRENCY_IDS } from '../lib/questNeeds';
import { bestTraderSell, canSellOnFlea, fleaFee, formatRub } from '../lib/pricing';
import { useSettings } from '../lib/settings';
import { toggleFavorite, useFavorites } from '../lib/userData';
import { formatAge } from '../lib/time';

export default function FleaScreen() {
  const settings = useSettings();
  const { items, tasks, lookups } = useLookups(settings.gameMode);
  const hideout = useHideout(settings.gameMode);
  const progress = useProgress(settings.gameMode);
  const hideoutLevels = useHideoutLevels(settings.gameMode);
  const favorites = useFavorites();
  const needs = useMemo(
    () => buildNeedsIndex(tasks.data?.data.tasks ?? [], progress, hideout.data?.data ?? [], hideoutLevels),
    [tasks.data, progress, hideout.data, hideoutLevels],
  );
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = items.data?.data.items ?? [];
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return [];
    return all
      .filter((i) => !i.types.includes('preset') || i.avg24hPrice)
      .filter((i) => i.name.toLowerCase().includes(q) || i.shortName.toLowerCase().includes(q))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [all, q]);

  const searching = q.length >= 2;
  const starred = favorites.map((id) => lookups.items.get(id)).filter((i): i is Item => !!i);
  // Before you search: what your quests and hideout still need, most wanted first.
  const keep = useMemo(
    () =>
      [...needs.entries()]
        .map(([id, list]) => ({ item: lookups.items.get(id), total: totalNeeded(list).total }))
        .filter(
          (n): n is { item: Item; total: number } =>
            !!n.item && !CURRENCY_IDS.has(n.item.id) && !favorites.includes(n.item.id),
        )
        .sort((a, b) => b.total - a.total || a.item.name.localeCompare(b.item.name))
        .slice(0, 100),
    [needs, lookups.items, favorites],
  );
  const sections: { title: string | null; items: Item[] }[] = searching
    ? [{ title: `${results.length} results`, items: results }]
    : [
        { title: starred.length ? 'Starred' : null, items: starred },
        { title: keep.length ? 'Keep these: your quests and hideout need them' : null, items: keep.map((k) => k.item) },
      ];
  const selected =
    (selectedId && lookups.items.get(selectedId)) || sections.find((sec) => sec.items.length)?.items[0] || null;
  const keepCount = new Map(keep.map((k) => [k.item.id, k.total]));

  return (
    <div className="screen split">
      <div className="split-list">
        <input
          type="search"
          placeholder="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {items.isPending && <p className="note">Loading prices…</p>}
        {items.error && !items.data && <p className="note error">Couldn't load prices. ({items.error.message})</p>}
        <div className="item-sections">
          {sections.map(
            (sec, i) =>
              sec.items.length > 0 && (
                <div key={i}>
                  {sec.title && <div className="subhead">{sec.title}</div>}
                  <ul className="item-list">
                    {sec.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={item.id === selected?.id ? 'active' : ''}
                          onClick={() => setSelectedId(item.id)}
                        >
                          {item.iconLink && <img src={item.iconLink} alt="" width={32} height={32} loading="lazy" />}
                          <span className="item-name">{item.name}</span>
                          {keepCount.has(item.id) ? (
                            <span className="badge keep" title="How many your quests and hideout still need">
                              ×{keepCount.get(item.id)!.toLocaleString('en-US')}
                            </span>
                          ) : (
                            needs.has(item.id) && <span className="badge keep" title="Needed for a quest or hideout upgrade">keep</span>
                          )}
                          <span className="item-price">{formatRub(item.avg24hPrice ?? bestTraderSell(item)?.priceRUB)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {!searching && !starred.length && !keep.length && items.data && (
            <p className="muted small">Type to search. Star items to keep them here.</p>
          )}
        </div>
      </div>

      <div className="split-detail">
        {selected ? (
          <ItemDetail
            item={selected}
            favorite={favorites.includes(selected.id)}
            needs={needs.get(selected.id)}
            flea={items.data!.data.fleaMarket}
            traderNames={lookups.traders}
          />
        ) : (
          <p className="note">Pick an item to see its prices.</p>
        )}
      </div>
    </div>
  );

}

interface ItemDetailProps {
  item: Item;
  favorite: boolean;
  needs: ItemNeed[] | undefined;
  flea: ItemsFeed['fleaMarket'];
  traderNames: Map<string, Trader>;
}

function ItemDetail({ item, favorite, needs, flea, traderNames }: ItemDetailProps) {
  const settings = useSettings();
  const slots = item.width * item.height;
  const sellable = canSellOnFlea(item);
  const fee = sellable ? fleaFee(item.basePrice, item.avg24hPrice!, {
    offerRate: flea.offerRate,
    requirementRate: flea.requirementRate,
    intelCenter3: settings.intelCenter3,
    hideoutManagement: settings.hideoutManagement,
  }) : 0;
  const fleaNet = sellable ? item.avg24hPrice! - fee : null;
  const traders = [...item.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB);
  const bestTrader = traders[0];
  const better =
    fleaNet !== null && bestTrader ? (fleaNet > bestTrader.priceRUB ? 'flea' : 'trader') : fleaNet !== null ? 'flea' : bestTrader ? 'trader' : null;
  const change = item.changeLast48hPercent;
  const needed = totalNeeded(needs);

  return (
    <div className="item-detail">
      <div className="item-title">
        {item.iconLink && <img src={item.iconLink} alt="" width={64} height={64} />}
        <div>
          <h2>{item.name}</h2>
          <div className="muted small">
            {item.width}×{item.height} · Prices updated {item.updated ? formatAge(Date.parse(item.updated)) : 'unknown'}
          </div>
        </div>
        <button
          type="button"
          className={`star${favorite ? ' on' : ''}`}
          onClick={() => toggleFavorite(item.id)}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>

      {needs && needs.length > 0 && (
        <div className="verdict verdict-keep">
          <strong>
            Keep it: {needed.total.toLocaleString('en-US')} needed
            {needed.fir > 0 ? `, ${needed.fir} found in raid` : ''}
          </strong>
          <ul>
            {needs.slice(0, 6).map((n, i) => (
              <li key={i}>
                {n.kind === 'quest' ? 'Quest' : 'Hideout'}: {n.label} ×{n.count}
                {n.foundInRaid && <span className="badge">FIR</span>}
              </li>
            ))}
            {needs.length > 6 && <li className="muted">and {needs.length - 6} more</li>}
          </ul>
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Flea 24h average</span>
          <span className="tile-value">{sellable ? formatRub(item.avg24hPrice) : '—'}</span>
          {sellable && change !== null && (
            <span className={`tile-sub ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% in 48h
            </span>
          )}
        </div>
        <div className={`tile${better === 'flea' ? ' best' : ''}`}>
          <span className="tile-label">You get on flea</span>
          <span className="tile-value">{sellable ? formatRub(fleaNet) : '—'}</span>
          {sellable && <span className="tile-sub muted">after {formatRub(fee)} fee</span>}
        </div>
        <div className={`tile${better === 'trader' ? ' best' : ''}`}>
          <span className="tile-label">Best trader</span>
          <span className="tile-value">{bestTrader ? formatRub(bestTrader.priceRUB) : '—'}</span>
          {bestTrader && <span className="tile-sub muted">{traderNames.get(bestTrader.trader)?.name}</span>}
        </div>
        <div className="tile">
          <span className="tile-label">Per slot ({slots})</span>
          <span className="tile-value">{formatRub(Math.max(fleaNet ?? 0, bestTrader?.priceRUB ?? 0) / slots || null)}</span>
          <span className="tile-sub muted">best sale ÷ slots</span>
        </div>
      </div>

      <details className="more">
        <summary>More prices</summary>
      <table className="prices">
        <tbody>
          {sellable ? (
            <>
              <tr><th>24h low / high</th><td>{formatRub(item.low24hPrice)} / {formatRub(item.high24hPrice)}</td></tr>
              <tr><th>Last lowest offer</th><td>{formatRub(item.lastLowPrice)}</td></tr>
              <tr>
                <th>Change, 48h</th>
                <td className={change === null ? '' : change >= 0 ? 'up' : 'down'}>
                  {change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% (${formatRub(item.changeLast48h)})`}
                </td>
              </tr>
            </>
          ) : (
            <tr><th>Flea</th><td>{item.types.includes('noFlea') ? "Can't be sold on the flea" : 'No recent flea price'}</td></tr>
          )}
        </tbody>
      </table>

      <h3>All traders</h3>
      {traders.length ? (
        <table className="prices">
          <tbody>
            {traders.map((t) => (
              <tr key={t.trader} className={t === bestTrader ? 'best' : ''}>
                <th>{traderNames.get(t.trader)?.name ?? t.trader}</th>
                <td>
                  {t.currency !== 'RUB' ? `${t.price.toLocaleString('en-US')} ${t.currency} (${formatRub(t.priceRUB)})` : formatRub(t.priceRUB)}
                  {slots > 1 ? ` · ${formatRub(t.priceRUB / slots)} per slot` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No trader buys this item.</p>
      )}
      </details>

      <p className="hint">
        Flea prices are community-reported snapshots from tarkov.dev, not a live feed. The fee uses the wiki formula
        {settings.intelCenter3 ? ' with the Intelligence Center discount' : ''}.
      </p>
      {item.wikiLink && (
        <a href={item.wikiLink} target="_blank" rel="noreferrer">
          Wiki
        </a>
      )}
    </div>
  );
}
