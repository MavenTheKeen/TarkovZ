import { describe, expect, it } from 'vitest';
import fixture from './maps-fixture.json';
import { createProjection } from '../lib/projection';
import { findMapConfig, slimMapConfigs } from '../api/transform';

const configs = slimMapConfigs(fixture.configs);

describe('createProjection', () => {
  it('matches the Leaflet maths used by tarkov.dev', () => {
    // transform [a, b, c, d], rotation 180: rotate (x, z) to (-x, -z), then
    // px = a * rx + b and py = -c * ry + d.
    const p = createProjection({ transform: [0.5, 100, 0.25, 50], coordinateRotation: 180, bounds: [[0, 0], [1, 1]] });
    const { px, py } = p.project({ x: 10, z: 20 });
    expect(px).toBeCloseTo(0.5 * -10 + 100);
    expect(py).toBeCloseTo(-0.25 * -20 + 50);
  });

  it('round-trips game coordinates for every rotation', () => {
    for (const coordinateRotation of [0, 90, 180, 270]) {
      const p = createProjection({ transform: [0.3, 160, 0.3, 140], coordinateRotation, bounds: [[0, 0], [1, 1]] });
      const back = p.unproject(p.project({ x: 123.4, z: -56.7 }));
      expect(back.x).toBeCloseTo(123.4, 6);
      expect(back.z).toBeCloseTo(-56.7, 6);
    }
  });

  // A wrong rotation or flipped axis would push extracts off the image.
  it.each(fixture.maps.map((m) => [m.normalizedName, m] as const))('puts %s extracts and spawns inside the map image', (_name, map) => {
    const config = findMapConfig(configs, map.normalizedName);
    if (!config) return; // No image for this map (e.g. the tutorial).
    const p = createProjection(config);
    const r = p.imageRect;
    const slack = Math.max(r.width, r.height) * 0.02;
    const points = [...map.extracts, ...map.spawns];
    const outside = points.filter(({ x, z }) => {
      const { px, py } = p.project({ x, z });
      return px < r.x - slack || px > r.x + r.width + slack || py < r.y - slack || py > r.y + r.height + slack;
    });
    // A few real points sit just past the drawn edge (e.g. a Customs flare
    // extract). Maps with too few points to judge (Icebreaker has 3) are
    // left to an in-game spot check.
    if (points.length < 10) return;
    expect(outside.length / points.length).toBeLessThanOrEqual(0.05);
  });
});

describe('findMapConfig', () => {
  it('maps variants to the image of their base map', () => {
    expect(findMapConfig(configs, 'night-factory')?.normalizedName).toBe('factory');
    expect(findMapConfig(configs, 'ground-zero-21')?.normalizedName).toBe('ground-zero');
    expect(findMapConfig(configs, 'the-lab-dark')?.normalizedName).toBe('the-lab');
    expect(findMapConfig(configs, 'infected-factory')?.normalizedName).toBe('factory');
    expect(findMapConfig(configs, 'customs')?.normalizedName).toBe('customs');
  });
});
