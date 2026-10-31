import { useMemo, useState } from 'react';
import { useLookups } from '../api/data';
import type { Item } from '../api/types';
import { caliberName, effectiveness } from '../lib/ammo';
import { acquireCost, formatRub } from '../lib/pricing';
import { createStore, useStore } from '../lib/store';
import { useSettings } from '../lib/settings';

type SortKey = 'name' | 'damage' | 'penetration' | 'armorDamage' | 'fragmentation' | 'speed' | 'price';

const caliberStore = createStore<string>('tarkovz.ammoCaliber.v1', 'Caliber545x39');
const ARMOR_CLASSES = [1, 2, 3, 4, 5, 6];

export default function AmmoScreen() {
  const { gameMode } = useSettings();
  const { items } = useLookups(gameMode);
  const caliber = useStore(caliberStore);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'penetration', desc: true });

  const ammo = useMemo(
    () => (items.data?.data.items ?? []).filter((i): i is Item & { ammo: NonNullable<Item['ammo']> } => !!i.ammo),
    [items.data],
  );
  // Calibres with the most rounds first, so common ones lead the list.
  const calibers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of ammo) counts.set(a.ammo.caliber, (counts.get(a.ammo.caliber) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, name: caliberName(id) }));
  }, [ammo]);

  const ctx = items.data
    ? { mode: 'flea' as const, gpCoinValue: items.data.data.gpCoinValue, fee: { offerRate: 0, requirementRate: 0 } }
    : null;
  const rows = ammo
    .filter((a) => a.ammo.caliber === caliber)
    .map((a) => ({ item: a, stats: a.ammo, price: ctx ? acquireCost(a, ctx) : null }));
  const value = (r: (typeof rows)[number]): number | string =>
    sort.key === 'name' ? r.item.shortName : sort.key === 'price' ? (r.price ?? Infinity) : r.stats[sort.key];
  rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return sort.desc ? -cmp : cmp;
  });

  const header = (key: SortKey, label: string, title?: string) => (
    <th className={key === 'name' ? '' : 'num'} title={title}>
      <button
        type="button"
        className={`sort${sort.key === key ? ' active' : ''}`}
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'price' }))}
      >
        {label}
        {sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  return (
    <div className="screen">
      <div className="filters">
        <select value={caliber} onChange={(e) => caliberStore.set(e.target.value)} aria-label="Calibre">
          {calibers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.n})
            </option>
          ))}
        </select>
        <span className="hint" title="Rule of thumb: penetration of about 10× the armour class gets through">
          Armour class 1–6: <span className="eff eff-great">great</span> <span className="eff eff-good">good</span>{' '}
          <span className="eff eff-poor">poor</span> <span className="eff eff-bad">bad</span>
        </span>
      </div>

      {items.isPending && <p className="note">Loading ammo…</p>}
      <table className="ammo-table">
        <thead>
          <tr>
            {header('name', 'Round')}
            {header('damage', 'Dmg', 'Flesh damage (× pellets for shot)')}
            {header('penetration', 'Pen', 'Penetration power')}
            {header('armorDamage', 'Armor', 'Armour damage %')}
            {header('fragmentation', 'Frag', 'Fragmentation chance')}
            {header('speed', 'Speed', 'Muzzle velocity, m/s')}
            {ARMOR_CLASSES.map((c) => (
              <th key={c} className="num cls" title={`Armour class ${c}`}>
                {c}
              </th>
            ))}
            {header('price', 'Price', 'Cheapest of flea average and trader')}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, stats, price }) => (
            <tr key={item.id}>
              <td>
                <div className="line">
                  {item.iconLink && <img src={item.iconLink} alt="" width={24} height={24} loading="lazy" />}
                  <span title={item.name}>{item.shortName}</span>
                  {stats.tracer && <span className="badge">tracer</span>}
                </div>
              </td>
              <td className="num">
                {stats.damage}
                {stats.projectiles > 1 ? `×${stats.projectiles}` : ''}
              </td>
              <td className="num strong">{stats.penetration}</td>
              <td className="num">{stats.armorDamage}</td>
              <td className="num">{Math.round(stats.fragmentation * 100)}%</td>
              <td className="num">{stats.speed}</td>
              {ARMOR_CLASSES.map((c) => (
                <td key={c} className={`num cls eff-${effectiveness(stats.penetration, c)}`} />
              ))}
              <td className="num">{formatRub(price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
