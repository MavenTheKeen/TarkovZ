import { describe, expect, it } from 'vitest';
import { floorOf } from '../lib/floors';

const config = {
  layers: [
    { name: '2nd Floor', extents: [{ height: [3, 6] as [number, number], areas: [{ x1: 0, z1: 0, x2: 10, z2: 10 }] }] },
    { name: 'Underground', extents: [{ height: [-1000, 0] as [number, number], areas: [] }] },
  ],
};

describe('floorOf', () => {
  it('puts a point on a floor only inside that floor’s areas', () => {
    expect(floorOf(config, { x: 5, z: 5, y: 4 })).toBe('2nd Floor');
    expect(floorOf(config, { x: 50, z: 5, y: 4 })).toBeNull();
  });

  it('uses floors without areas anywhere on the map', () => {
    expect(floorOf(config, { x: 50, z: 50, y: -5 })).toBe('Underground');
  });

  it('is unknown without a height', () => {
    expect(floorOf(config, { x: 5, z: 5 })).toBeUndefined();
  });
});
