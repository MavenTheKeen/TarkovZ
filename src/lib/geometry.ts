import type { GamePoint } from './projection';

/** Straight-line distance on the map plane, ignoring height, walls and terrain. */
export function distance2d(a: GamePoint, b: GamePoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Ray-casting point-in-polygon test on the x/z plane. */
export function pointInPolygon(p: GamePoint, polygon: GamePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function centroid(points: GamePoint[]): GamePoint {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
  return { x: sum.x / points.length, z: sum.z / points.length };
}
