import type { Barter, Item } from '../api/types';
import { acquireCost, sellValue, type PriceContext } from './pricing';

export interface BarterLine {
  item: Item | undefined;
  itemId: string;
  count: number;
  /** Price per unit in roubles, or null when unknown. */
  unit: number | null;
}

export interface BarterResult {
  barter: Barter;
  inputs: BarterLine[];
  reward: BarterLine & { where: 'flea' | 'trader' | null; fee: number };
  cost: number | null;
  value: number | null;
  /** Reward value minus input cost; null when any price is unknown. */
  profit: number | null;
}

/**
 * Profit of a barter: what the reward sells for (after the flea fee when
 * sold on the flea) minus what the required items cost to obtain.
 */
export function evaluateBarter(barter: Barter, items: Map<string, Item>, ctx: PriceContext): BarterResult {
  const inputs = barter.requiredItems.map((r): BarterLine => {
    const item = items.get(r.item);
    return { item, itemId: r.item, count: r.count, unit: item ? acquireCost(item, ctx) : null };
  });
  const rewardItem = items.get(barter.offeredItem.item);
  const sale = rewardItem ? sellValue(rewardItem, ctx) : null;
  const reward = {
    item: rewardItem,
    itemId: barter.offeredItem.item,
    count: barter.offeredItem.count,
    unit: sale?.value ?? null,
    where: sale?.where ?? null,
    fee: sale?.fee ?? 0,
  };
  const cost = inputs.every((i) => i.unit !== null) ? inputs.reduce((sum, i) => sum + i.unit! * i.count, 0) : null;
  const value = reward.unit !== null ? reward.unit * reward.count : null;
  return { barter, inputs, reward, cost, value, profit: cost !== null && value !== null ? value - cost : null };
}
