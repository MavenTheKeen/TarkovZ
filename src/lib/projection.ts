// Converts game coordinates to map image coordinates, following the same maths
// as the tarkov.dev site (a Leaflet CRS.Simple with rotation, a linear
// transform, and the image stretched over the projected bounds).
//
// "Plane" units are Leaflet's zoom-0 pixel space. The map SVG uses them
// directly as its viewBox, so nothing else needs to know about the transform.

export interface GamePoint {
  x: number;
  z: number;
  /** Height in metres, where known: used to pick the floor a point is on. */
  y?: number;
}

export interface PlanePoint {
  px: number;
  py: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectionConfig {
  /** [scaleX, marginX, scaleZ, marginZ] */
  transform: [number, number, number, number];
  coordinateRotation: number;
  /** Two opposite corners in game coordinates, each [x, z]. */
  bounds: [[number, number], [number, number]];
  svgBounds?: [[number, number], [number, number]];
}

export interface Projection {
  project: (p: GamePoint) => PlanePoint;
  unproject: (p: PlanePoint) => GamePoint;
  /** Where the map image is drawn, in plane units. */
  imageRect: Rect;
  /** Plane rect covering the full playable bounds. */
  boundsRect: Rect;
  /** Plane units per game metre (for converting distances). */
  unitsPerMetre: number;
}

export function createProjection(config: ProjectionConfig): Projection {
  const [a, b, rawC, d] = config.transform;
  const c = -rawC;
  const theta = ((config.coordinateRotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const project = ({ x, z }: GamePoint): PlanePoint => {
    const rx = x * cos - z * sin;
    const ry = x * sin + z * cos;
    return { px: a * rx + b, py: c * ry + d };
  };

  const unproject = ({ px, py }: PlanePoint): GamePoint => {
    const rx = (px - b) / a;
    const ry = (py - d) / c;
    return { x: rx * cos + ry * sin, z: -rx * sin + ry * cos };
  };

  // Leaflet places an image overlay between the projected north-west and
  // south-east corners of its lat/lng bounds (lat = z, lng = x).
  const rectFor = (bounds: [[number, number], [number, number]]): Rect => {
    const xs = [bounds[0][0], bounds[1][0]];
    const zs = [bounds[0][1], bounds[1][1]];
    const nw = project({ x: Math.min(...xs), z: Math.max(...zs) });
    const se = project({ x: Math.max(...xs), z: Math.min(...zs) });
    const x = Math.min(nw.px, se.px);
    const y = Math.min(nw.py, se.py);
    return { x, y, width: Math.abs(se.px - nw.px), height: Math.abs(se.py - nw.py) };
  };

  return {
    project,
    unproject,
    imageRect: rectFor(config.svgBounds ?? config.bounds),
    boundsRect: rectFor(config.bounds),
    unitsPerMetre: Math.abs(a),
  };
}
