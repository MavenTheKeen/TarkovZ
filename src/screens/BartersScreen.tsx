import { useMemo, useState } from 'react';
import { useBarters, useLookups } from '../api/data';
import { evaluateBarter, type BarterLine } from '../lib/barters';
import { formatRub, type PriceContext } from '../lib/pricing';
import { useProgress } from '../lib/progress';
import { updateSettings, useSettings } from '../lib/settings';

export default function BartersScreen() {
  const settings = useSettings();
  const mode = settings.gameMode;
  const { items, traders, lookups } = useLookups(mode);
  const barters = useBarters(mode);
  const progress = useProgress(mode);

  const [trader, setTrader] = useState('');
  const [hideLocked, setHideLocked] = useState(true);
  const [hideUnpriced, setHideUnpriced] = useState(true);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!items.data || !barters.data) return [];
    const ctx: PriceContext = {
      mode: settings.barterPricing,
      gpCoinValue: items.data.data.gpCoinValue,
      fee: {
        offerRate: items.data.data.fleaMarket.offerRate,
        requirementRate: items.data.data.fleaMarket.requirementRate,
        intelCenter3: settings.intelCenter3,
        hideoutManagement: settings.hideoutManagement,
      },
    };
    return barters.data.data
      .map((b) => evaluateBarter(b, lookups.items, ctx))
      .sort((x, y) => (y.profit ?? -Infinity) - (x.profit ?? -Infinity));
  }, [barters.data, items.data, lookups.items, settings.barterPricing, settings.intelCenter3, settings.hideoutManagement]);

  const traderLevel = (id: string) => settings.traderLevels[id] ?? lookups.traders.get(id)?.maxLevel ?? 4;
  const q = query.trim().toLowerCase();
  const shown = results
    .filter((r) => !trader || r.barter.trader === trader)
    .filter((r) => r.barter.minTraderLevel <= traderLevel(r.barter.trader))
    .filter((r) => !hideLocked || !r.barter.taskUnlock || progress.tasks[r.barter.taskUnlock])
    .filter((r) => !hideUnpriced || r.profit !== null)
    .filter((r) => !q || [r.reward, ...r.inputs].some((l) => l.item?.name.toLowerCase().includes(q)));

  const traderList = traders.data?.data.filter((t) => results.some((r) => r.barter.trader === t.id)) ?? [];

  return (
    <div className="screen">
      <div className="filters">
        <input type="search" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={trader} onChange={(e) => setTrader(e.target.value)} aria-label="Trader">
          <option value="">All traders</option>
          {traderList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {trader && (
          <label className="field inline">
            My level
            <select
              value={traderLevel(trader)}
              onChange={(e) =>
                updateSettings({ traderLevels: { ...settings.traderLevels, [trader]: Number(e.target.value) } })
              }
            >
              {Array.from({ length: lookups.traders.get(trader)?.maxLevel ?? 4 }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  LL{l}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="segmented small" role="group" aria-label="Prices" title="Which prices to value items at">
          {(['flea', 'trader'] as const).map((p) => (
            <button key={p} type="button" className={settings.barterPricing === p ? 'active' : ''} onClick={() => updateSettings({ barterPricing: p })}>
              {p === 'flea' ? 'Flea prices' : 'Trader prices'}
            </button>
          ))}
        </div>
        <div className="chips">
          <button type="button" className={`chip${hideLocked ? ' on' : ''}`} onClick={() => setHideLocked((v) => !v)} title="Uses the quests you've ticked as done">
            Hide quest-locked
          </button>
          <button type="button" className={`chip${hideUnpriced ? ' on' : ''}`} onClick={() => setHideUnpriced((v) => !v)}>
            Hide unpriced
          </button>
        </div>
      </div>

      <details className="hint-details">
        <summary>How profit is worked out</summary>
        <p className="hint">
          Profit = reward value − cost of required items.{' '}
          {settings.barterPricing === 'flea'
            ? 'The reward is valued at its 24h flea average minus the listing fee (or the best trader price if it can’t be sold on the flea); inputs at the cheaper of flea and trader.'
            : 'The reward is valued at the best trader sell price; inputs at trader prices, falling back to the flea.'}
        </p>
      </details>

      {(barters.isPending || items.isPending) && <p className="note">Loading barters and prices…</p>}
      {(barters.error || items.error) && !(barters.data && items.data) && (
        <p className="note error">Couldn't load barters. ({(barters.error ?? items.error)!.message})</p>
      )}

      <table className="barters">
        <thead>
          <tr>
            <th>Reward</th>
            <th>Trader</th>
            <th>Required items</th>
            <th className="num">Cost</th>
            <th className="num">Value</th>
            <th className="num">Profit</th>
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, 300).map((r) => (
            <tr key={r.barter.id}>
              <td>
                <Line line={r.reward} showPrice={false} />
              </td>
              <td>
                {lookups.traders.get(r.barter.trader)?.name} LL{r.barter.minTraderLevel}
                {r.barter.taskUnlock && (
                  <div className="muted small">Quest: {lookups.tasks.get(r.barter.taskUnlock)?.name ?? 'unknown'}</div>
                )}
              </td>
              <td>
                {r.inputs.map((l) => (
                  <Line key={l.itemId} line={l} />
                ))}
              </td>
              <td className="num">{formatRub(r.cost)}</td>
              <td
                className="num"
                title={r.reward.where === 'flea' && r.reward.fee > 0 ? `After a ${formatRub(r.reward.fee)} flea fee` : undefined}
              >
                {formatRub(r.value)}
              </td>
              <td className={`num ${r.profit === null ? '' : r.profit >= 0 ? 'up' : 'down'}`}>{formatRub(r.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > 300 && <p className="muted small">Showing the top 300 of {shown.length}.</p>}
    </div>
  );
}

function Line({ line, showPrice = true }: { line: BarterLine; showPrice?: boolean }) {
  return (
    <div className="line">
      {line.item?.iconLink && <img src={line.item.iconLink} alt="" width={24} height={24} loading="lazy" />}
      <span>
        {line.count !== 1 ? `${Number(line.count.toFixed(2)).toLocaleString('en-US')} × ` : ''}
        {line.item?.name ?? 'Unknown item'}
      </span>
      {showPrice && <span className="muted small">{line.unit === null ? 'no price' : formatRub(line.unit)}</span>}
    </div>
  );
}
