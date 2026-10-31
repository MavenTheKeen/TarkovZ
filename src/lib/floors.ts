import type { MapConfig } from '../api/types';
import type { GamePoint } from './projection';

/**
 * The floor a point is on: a layer name, null for the base level, or
 * undefined when the point has no height and could be on any floor.
 */
export function floorOf(config: Pick<MapConfig, 'layers'>, p: GamePoint): string | null | undefined {
  if (p.y === undefined) return undefined;
  for (const layer of config.layers) {
    for (const e of layer.extents) {
      if (p.y < e.height[0] || p.y > e.height[1]) continue;
      if (!e.areas.length || e.areas.some((a) => p.x >= a.x1 && p.x <= a.x2 && p.z >= a.z1 && p.z <= a.z2)) {
        return layer.name;
      }
    }
  }
  return null;
}
