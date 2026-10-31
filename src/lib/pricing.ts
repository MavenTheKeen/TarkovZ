import type { Item } from '../api/types';

export const ROUBLES_ID = '5449016a4bdc2d6f028b456f';
export const GP_COIN_ID = '5d235b4d86f7742e017bc88a';

export interface FeeOptions {
  /** Offer fee rate (Ti) from the flea market settings in the item feed. */
  offerRate: number;
  /** Requirement fee rate (Tr). */
  requirementRate: number;
  /** Intelligence Center level 3 cuts the fee by 30%. */
  intelCenter3?: boolean;
  /** Hideout Management skill level, which boosts the Intelligence Center discount. */
  hideoutManagement?: number;
  count?: number;
}

/**
 * Flea market listing fee, as given on the wiki and used by tarkov.dev.
 * basePrice is the item's base (handbook) price, sellPrice the listing price.
 */
export function fleaFee(basePrice: number, sellPrice: number, opts: FeeOptions): number {
  if (basePrice <= 0 || sellPrice <= 0) return 0;
  const count = opts.count ?? 1;
  const V0 = basePrice;
  const VR = sellPrice;
  let P0 = Math.log10(V0 / VR);
  let PR = Math.log10(VR / V0);
  if (VR < V0) P0 = Math.pow(P0, 1.08);
  if (VR >= V0) PR = Math.pow(PR, 1.08);
  const IC = opts.intelCenter3 ? 1 - (0.01 * (opts.hideoutManagement ?? 0) + 1) * 0.3 : 1;
  const fee =
    V0 * opts.offerRate * Math.pow(4, P0) * count + VR * opts.requirementRate * Math.pow(4, PR) * count;
  return Math.ceil(fee) * IC;
}

export function canSellOnFlea(item: Item): boolean {
  return !item.types.includes('noFlea') && !!item.avg24hPrice;
}

/** Best trader sell offer in roubles, or null if no trader buys it. */
export function bestTraderSell(item: Item): { trader: string; priceRUB: number } | null {
  let best: { trader: string; priceRUB: number } | null = null;
  for (const offer of item.sellToTrader) {
    if (!best || offer.priceRUB > best.priceRUB) best = { trader: offer.trader, priceRUB: offer.priceRUB };
  }
  return best;
}

/** Cheapest trader buy offer in roubles, or null if no trader sells it. */
export function cheapestTraderBuy(item: Item): { trader: string; priceRUB: number; minTraderLevel: number } | null {
  let best: { trader: string; priceRUB: number; minTraderLevel: number } | null = null;
  for (const offer of item.buyFromTrader) {
    if (!best || offer.priceRUB < best.priceRUB) {
      best = { trader: offer.trader, priceRUB: offer.priceRUB, minTraderLevel: offer.minTraderLevel };
    }
  }
  return best;
}

export type PricingMode = 'flea' | 'trader';

export interface PriceContext {
  mode: PricingMode;
  fee: FeeOptions;
  /** Value of one GP coin in roubles, from the item feed settings. */
  gpCoinValue: number;
}

/**
 * What it costs to obtain one of this item. Flea mode buys at the 24-hour
 * flea average (or from a trader if cheaper); trader mode buys from traders
 * and falls back to the flea. Returns null when there is no known price.
 */
export function acquireCost(item: Item, ctx: PriceContext): number | null {
  if (item.id === ROUBLES_ID) return 1;
  if (item.id === GP_COIN_ID) return ctx.gpCoinValue || null;
  const flea = canSellOnFlea(item) ? item.avg24hPrice : null;
  const trader = cheapestTraderBuy(item)?.priceRUB ?? null;
  if (ctx.mode === 'flea') {
    if (flea !== null && trader !== null) return Math.min(flea, trader);
    return flea ?? trader;
  }
  return trader ?? flea;
}

/**
 * What one of this item is worth when sold. Flea mode sells at the 24-hour
 * average minus the listing fee (or to a trader if no flea price); trader
 * mode sells to the best trader.
 */
export function sellValue(item: Item, ctx: PriceContext): { value: number; where: 'flea' | 'trader'; fee: number } | null {
  if (item.id === ROUBLES_ID) return { value: 1, where: 'trader', fee: 0 };
  const trader = bestTraderSell(item)?.priceRUB ?? null;
  if (ctx.mode === 'flea' && canSellOnFlea(item) && item.avg24hPrice) {
    const fee = fleaFee(item.basePrice, item.avg24hPrice, ctx.fee);
    return { value: item.avg24hPrice - fee, where: 'flea', fee };
  }
  return trader !== null ? { value: trader, where: 'trader', fee: 0 } : null;
}

export function formatRub(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value).toLocaleString('en-US')} ₽`;
}
