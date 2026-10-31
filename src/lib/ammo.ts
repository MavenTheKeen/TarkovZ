// Calibre ids come untranslated from the feed, e.g. "Caliber556x45NATO".
const CALIBER_NAMES: Record<string, string> = {
  Caliber556x45NATO: '5.56x45 NATO',
  Caliber545x39: '5.45x39',
  Caliber762x39: '7.62x39',
  Caliber762x51: '7.62x51 NATO',
  Caliber762x54R: '7.62x54R',
  Caliber762x35: '.300 Blackout',
  Caliber9x19PARA: '9x19 Parabellum',
  Caliber9x18PM: '9x18 Makarov',
  Caliber9x21: '9x21 Gyurza',
  Caliber9x39: '9x39',
  Caliber762x25TT: '7.62x25 Tokarev',
  Caliber1143x23ACP: '.45 ACP',
  Caliber46x30: '4.6x30 HK',
  Caliber57x28: '5.7x28 FN',
  Caliber366TKM: '.366 TKM',
  Caliber127x55: '12.7x55',
  Caliber86x70: '.338 Lapua Magnum',
  Caliber9x33R: '.357 Magnum',
  Caliber12g: '12 gauge',
  Caliber20g: '20 gauge',
  Caliber23x75: '23x75 (KS-23)',
  Caliber68x51: '6.8x51',
  Caliber127x33: '.50 AE',
  Caliber784x49: '.308 ME',
  Caliber127x99: '12.7x99 (.50 BMG)',
  Caliber93x64: '9.3x64',
  Caliber58x42: '5.8x42',
  Caliber40x46: '40x46 grenade',
  Caliber40mmRU: '40mm VOG',
  Caliber26x75: '26x75 flare',
  Caliber20x1mm: '20x1 (toy)',
};

export function caliberName(id: string): string {
  return CALIBER_NAMES[id] ?? id.replace(/^Caliber/, '').replace(/(\d)(\d)x/, '$1.$2x');
}

export type Effectiveness = 'great' | 'good' | 'poor' | 'bad';

/**
 * How well a round does against an armour class, by the common rule of thumb
 * that penetration around ten times the class gets through reliably.
 */
export function effectiveness(penetration: number, armorClass: number): Effectiveness {
  const margin = penetration - armorClass * 10;
  if (margin >= 10) return 'great';
  if (margin >= 0) return 'good';
  if (margin >= -10) return 'poor';
  return 'bad';
}
