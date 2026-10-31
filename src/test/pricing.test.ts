import { describe, expect, it } from 'vitest';
import { acquireCost, fleaFee, sellValue, type PriceContext } from '../lib/pricing';
import { evaluateBarter } from '../lib/barters';
import type { Item } from '../api/types';

const rates = { offerRate: 0.05, requirementRate: 0.05 };

describe('fleaFee', () => {
  it('is Ti + Tr of the price when listing at base price', () => {
    // log10(1) = 0, so both 4^P terms are 1.
    expect(fleaFee(100_000, 100_000, rates)).toBe(10_000);
  });

  it('applies the Intelligence Center discount', () => {
    expect(fleaFee(100_000, 100_000, { ...rates, intelCenter3: true })).toBeCloseTo(7_000);
    expect(fleaFee(100_000, 100_000, { ...rates, intelCenter3: true, hideoutManagement: 50 })).toBeCloseTo(5_500);
  });

  it('rises with the listing price', () => {
    const atBase = fleaFee(10_000, 10_000, rates);
    expect(fleaFee(10_000, 20_000, rates)).toBeGreaterThan(atBase);
    expect(fleaFee(10_000, 5_000, rates)).toBeLessThan(atBase);
  });

  it('matches the formula for a worked example', () => {
    // V0 = 20 000, VR = 50 000: PR = log10(2.5)^1.08, P0 = log10(0.4).
    const PR = Math.pow(Math.log10(2.5), 1.08);
    const P0 = Math.log10(0.4);
    const expected = Math.ceil(20_000 * 0.05 * 4 ** P0 + 50_000 * 0.05 * 4 ** PR);
    expect(fleaFee(20_000, 50_000, rates)).toBe(expected);
  });
});

function item(partial: Partial<Item> & { id: string }): Item {
  return {
    name: partial.id,
    shortName: partial.id,
    normalizedName: partial.id,
    width: 1,
    height: 1,
    basePrice: 10_000,
    avg24hPrice: null,
    low24hPrice: null,
    high24hPrice: null,
    lastLowPrice: null,
    changeLast48h: null,
    changeLast48hPercent: null,
    updated: null,
    iconLink: null,
    wikiLink: null,
    types: [],
    sellToTrader: [],
    buyFromTrader: [],
    ...partial,
  };
}

const ctx = (mode: 'flea' | 'trader'): PriceContext => ({ mode, fee: rates, gpCoinValue: 7_000 });

describe('item values', () => {
  const bolts = item({
    id: 'bolts',
    avg24hPrice: 30_000,
    buyFromTrader: [{ trader: 't', price: 25_000, priceRUB: 25_000, currency: 'RUB', minTraderLevel: 1, taskUnlock: null }],
    sellToTrader: [{ trader: 't', price: 12_000, priceRUB: 12_000, currency: 'RUB' }],
  });

  it('buys at the cheaper of flea and trader in flea mode', () => {
    expect(acquireCost(bolts, ctx('flea'))).toBe(25_000);
  });

  it('sells on the flea net of the fee in flea mode, to traders in trader mode', () => {
    const fee = fleaFee(10_000, 30_000, rates);
    expect(sellValue(bolts, ctx('flea'))).toEqual({ value: 30_000 - fee, where: 'flea', fee });
    expect(sellValue(bolts, ctx('trader'))).toEqual({ value: 12_000, where: 'trader', fee: 0 });
  });

  it('falls back to traders for items that cannot be sold on the flea', () => {
    const noFlea = item({ id: 'nf', avg24hPrice: 50_000, types: ['noFlea'], sellToTrader: [{ trader: 't', price: 9_000, priceRUB: 9_000, currency: 'RUB' }] });
    expect(sellValue(noFlea, ctx('flea'))?.where).toBe('trader');
  });
});

describe('evaluateBarter', () => {
  const items = new Map<string, Item>([
    ['a', item({ id: 'a', avg24hPrice: 10_000 })],
    ['b', item({ id: 'b', avg24hPrice: 5_000 })],
    ['reward', item({ id: 'reward', basePrice: 40_000, avg24hPrice: 40_000 })],
    ['unpriced', item({ id: 'unpriced' })],
  ]);

  it('subtracts input cost and flea fee from the reward value', () => {
    const r = evaluateBarter(
      { id: 'x', trader: 't', minTraderLevel: 1, taskUnlock: null, buyLimit: null, requiredItems: [{ item: 'a', count: 2 }, { item: 'b', count: 1 }], offeredItem: { item: 'reward', count: 1 } },
      items,
      ctx('flea'),
    );
    expect(r.cost).toBe(25_000);
    expect(r.reward.fee).toBe(4_000);
    expect(r.profit).toBe(40_000 - 4_000 - 25_000);
  });

  it('gives no profit when an input has no price', () => {
    const r = evaluateBarter(
      { id: 'y', trader: 't', minTraderLevel: 1, taskUnlock: null, buyLimit: null, requiredItems: [{ item: 'unpriced', count: 1 }], offeredItem: { item: 'reward', count: 1 } },
      items,
      ctx('flea'),
    );
    expect(r.profit).toBeNull();
  });
});
