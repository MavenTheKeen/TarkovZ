import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MapConfig } from '../api/types';
import { createProjection, type GamePoint, type Rect } from '../lib/projection';
import type { Feature } from '../lib/mapFeatures';
import { layerSvgUrl } from '../lib/svgLayers';
import { floorOf } from '../lib/floors';

export interface MapPick {
  point: GamePoint;
  /** Feature directly under the pointer, if any. */
  featureId?: string;
  /** Pick radius in game metres, matching what was visible under the pointer. */
  radius: number;
}

interface MapViewProps {
  config: MapConfig;
  svgText?: string;
  /** Selected floor: the layer's name, or null for the base level. */
  floor: string | null;
  features: Feature[];
  showLabels: boolean;
  highlight: GamePoint[];
  selectedId?: string;
  /** Spot the user picked as "I am here", drawn as a crosshair. */
  marker?: GamePoint | null;
  focus: { points: GamePoint[]; nonce: number } | null;
  onPick: (pick: MapPick) => void;
  /** When on, the next click drops your spawn pin instead of picking. */
  pinMode: boolean;
  /** Called with the spot for your pin (pin mode click, or right-click anywhere). */
  onDropPin: (point: GamePoint) => void;
}

interface View {
  cx: number;
  cy: number;
  /** Screen pixels per plane unit. */
  scale: number;
}

const PICK_RADIUS_PX = 18;
/** Extract, transit and boss names show once zoomed in this far past "fit". */
const NAME_ZOOM = 2.2;
const NAMED_KINDS = new Set<Feature['kind']>(['extract', 'transit', 'boss']);
/** Scale bar lengths to choose from, in metres. */
const SCALE_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MAX_TILES = 300;

function useObjectUrl(make: () => string | null, deps: unknown[]): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = make();
    setUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, deps);
  return url;
}

function fitView(rect: Rect, width: number, height: number): View {
  const scale = Math.min(width / rect.width, height / rect.height) * 0.95;
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, scale };
}

export default function MapView(props: MapViewProps) {
  const { config, svgText, floor, features, showLabels, highlight, selectedId, marker, focus, onPick, pinMode, onDropPin } = props;
  const projection = useMemo(() => createProjection(config), [config]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const fitScale = size.width ? fitView(projection.boundsRect, size.width, size.height).scale : 1;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit the whole map whenever the map changes or the window first gets a size.
  const hasSize = size.width > 0 && size.height > 0;
  useEffect(() => {
    if (hasSize) setView(fitView(projection.boundsRect, size.width, size.height));
  }, [projection, hasSize]);

  // Jump to requested points (search results, "show on map").
  useEffect(() => {
    if (!focus || !hasSize || !focus.points.length) return;
    const pts = focus.points.map(projection.project);
    const xs = pts.map((p) => p.px);
    const ys = pts.map((p) => p.py);
    const rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    // Pad so single points and tight clusters still show their surroundings.
    const minSpan = projection.boundsRect.width / 8;
    const padded = {
      x: rect.x - Math.max(minSpan - rect.width, rect.width * 0.2) / 2,
      y: rect.y - Math.max(minSpan - rect.height, rect.height * 0.2) / 2,
      width: Math.max(minSpan, rect.width * 1.2),
      height: Math.max(minSpan, rect.height * 1.2),
    };
    setView(fitView(padded, size.width, size.height));
  }, [focus?.nonce, projection, hasSize]);

  // Wheel zoom around the pointer. Registered natively to allow preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const mx = e.clientX - box.left - box.width / 2;
      const my = e.clientY - box.top - box.height / 2;
      setView((v) => {
        if (!v) return v;
        const scale = Math.min(Math.max(v.scale * Math.exp(-e.deltaY * 0.0015), fitScale * 0.5), fitScale * 64);
        const wx = v.cx + mx / v.scale;
        const wy = v.cy + my / v.scale;
        return { cx: wx - mx / scale, cy: wy - my / scale, scale };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fitScale]);

  const drag = useRef<{ x: number; y: number; moved: boolean; featureId?: string } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = (e.target as Element).closest('[data-fid]');
    drag.current = { x: e.clientX, y: e.clientY, moved: false, featureId: target?.getAttribute('data-fid') ?? undefined };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => (v ? { ...v, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale } : v));
  };

  const pointAt = (e: { clientX: number; clientY: number; currentTarget: Element }, v: View): GamePoint => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = v.cx + (e.clientX - box.left - box.width / 2) / v.scale;
    const py = v.cy + (e.clientY - box.top - box.height / 2) / v.scale;
    return projection.unproject({ px, py });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !view) return;
    if (pinMode) {
      onDropPin(pointAt(e, view));
      return;
    }
    onPick({
      point: pointAt(e, view),
      featureId: d.featureId,
      radius: PICK_RADIUS_PX / view.scale / projection.unitsPerMetre,
    });
  };

  const zoomBy = (factor: number) =>
    setView((v) => (v ? { ...v, scale: Math.min(Math.max(v.scale * factor, fitScale * 0.5), fitScale * 64) } : v));

  // + / − zoom and 0 fits the map, unless you're typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest('input, select, textarea')) return;
      if (e.key === '+' || e.key === '=') zoomBy(1.5);
      else if (e.key === '-') zoomBy(1 / 1.5);
      else if (e.key === '0' && hasSize) setView(fitView(projection.boundsRect, size.width, size.height));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitScale, projection, hasSize, size.width, size.height]);

  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const onHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.moved) return setHover(null);
    const id = (e.target as Element).closest('[data-fid]')?.getAttribute('data-fid');
    const box = e.currentTarget.getBoundingClientRect();
    setHover(id ? { id, x: e.clientX - box.left, y: e.clientY - box.top } : null);
  };

  // Which floor each feature is on, so markers on other floors can fade out.
  const featureFloors = useMemo(() => new Map(features.map((f) => [f.id, floorOf(config, f.position)])), [features, config]);
  const offFloor = (f: Feature) => {
    const on = featureFloors.get(f.id);
    return on !== undefined && on !== floor;
  };

  // Map image: SVG layers for vector maps, tiles for satellite-style maps.
  const floorLayer = config.layers.find((l) => l.name === floor);
  const baseUrl = useObjectUrl(
    () => (svgText && config.svgLayer ? layerSvgUrl(svgText, config.svgLayer, true) : null),
    [svgText, config.svgLayer],
  );
  const floorUrl = useObjectUrl(
    () => (svgText && floorLayer?.svgLayer ? layerSvgUrl(svgText, floorLayer.svgLayer, false) : null),
    [svgText, floorLayer?.svgLayer],
  );

  if (!view || !hasSize) {
    return <div ref={containerRef} className="map-view" />;
  }

  const vb = {
    x: view.cx - size.width / 2 / view.scale,
    y: view.cy - size.height / 2 / view.scale,
    width: size.width / view.scale,
    height: size.height / view.scale,
  };
  const inv = 1 / view.scale;
  const img = projection.imageRect;

  const tiles = (tilePath: string | undefined) => {
    if (!tilePath || config.svgPath) return null;
    const z = Math.min(Math.max(Math.round(Math.log2(view.scale)), config.minZoom), config.maxZoom);
    const ts = config.tileSize / 2 ** z;
    const x0 = Math.max(vb.x, img.x);
    const y0 = Math.max(vb.y, img.y);
    const x1 = Math.min(vb.x + vb.width, img.x + img.width);
    const y1 = Math.min(vb.y + vb.height, img.y + img.height);
    if (x1 <= x0 || y1 <= y0) return null;
    const out = [];
    for (let ty = Math.floor(y0 / ts); ty <= Math.floor(y1 / ts); ty++) {
      for (let tx = Math.floor(x0 / ts); tx <= Math.floor(x1 / ts); tx++) {
        if (out.length >= MAX_TILES || tx < 0 || ty < 0) continue;
        const href = tilePath.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty));
        out.push(
          <image key={`${z}/${tx}/${ty}`} href={href} x={tx * ts} y={ty * ts} width={ts} height={ts} preserveAspectRatio="none" />,
        );
      }
    }
    return out;
  };

  const toPlane = (p: GamePoint) => projection.project(p);
  const showNames = view.scale >= fitScale * NAME_ZOOM;
  const hovered = hover && features.find((f) => f.id === hover.id);

  // One name per cluster: a boss with five spawn spots in one building gets one label.
  const named = new Set<string>();
  if (showNames) {
    const placed: { title: string; px: number; py: number }[] = [];
    for (const f of features) {
      if (!NAMED_KINDS.has(f.kind)) continue;
      const q = toPlane(f.position);
      const near = placed.some((p) => p.title === f.title && Math.hypot(p.px - q.px, p.py - q.py) * view.scale < 80);
      if (near) continue;
      placed.push({ title: f.title, ...q });
      named.add(f.id);
    }
  }

  // Scale bar: the largest step that fits in about 120 screen pixels.
  const pxPerMetre = view.scale * projection.unitsPerMetre;
  const scaleMetres = [...SCALE_STEPS].reverse().find((m) => m * pxPerMetre <= 120) ?? SCALE_STEPS[0];
  const areas = features.filter((f) => f.outline);
  const ordered = [...features].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <div
      ref={containerRef}
      className={`map-view${pinMode ? ' pin-mode' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onDropPin(pointAt(e, view));
      }}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        onPointerMove(e);
        onHover(e);
      }}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <svg viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`} width={size.width} height={size.height}>
        {baseUrl && <image href={baseUrl} x={img.x} y={img.y} width={img.width} height={img.height} />}
        {floorUrl && <image href={floorUrl} x={img.x} y={img.y} width={img.width} height={img.height} />}
        {tiles(config.tilePath)}
        {tiles(floorLayer?.tilePath)}

        {areas.map((f) => (
          <polygon
            key={`area-${f.id}`}
            data-fid={f.id}
            className={`area area-${f.kind}${f.variant ? ` area-${f.variant}` : ''}${f.id === selectedId ? ' selected' : ''}${offFloor(f) ? ' off-floor' : ''}`}
            points={f.outline!.map((p) => {
              const q = toPlane(p);
              return `${q.px},${q.py}`;
            }).join(' ')}
          />
        ))}

        {showLabels &&
          config.labels.map((l, i) => {
            const q = toPlane({ x: l.position[0], z: l.position[1] });
            return (
              <text key={`label-${i}`} className="map-label" transform={`translate(${q.px},${q.py}) scale(${inv})`}>
                {l.text}
              </text>
            );
          })}

        {ordered.map((f) => {
          const q = toPlane(f.position);
          return (
            <g
              key={f.id}
              data-fid={f.id}
              className={`pin pin-${f.kind}${f.variant ? ` pin-${f.variant}` : ''}${f.id === selectedId ? ' selected' : ''}${offFloor(f) ? ' off-floor' : ''}`}
              transform={`translate(${q.px},${q.py}) scale(${inv})`}
            >
              <PinShape kind={f.kind} />
              {named.has(f.id) && (
                <text className="pin-name" x={11} y={4}>
                  {f.title}
                </text>
              )}
            </g>
          );
        })}

        {highlight.map((p, i) => {
          const q = toPlane(p);
          return <circle key={`hl-${i}`} className="highlight-ring" cx={q.px} cy={q.py} r={14 * inv} strokeWidth={3 * inv} />;
        })}

        {marker && (() => {
          const q = toPlane(marker);
          return (
            <g className="you-marker" transform={`translate(${q.px},${q.py}) scale(${inv})`}>
              <circle className="you-pulse" r={14} />
              <path d="M 0 0 C -3 -6 -10 -10 -10 -17 A 10 10 0 1 1 10 -17 C 10 -10 3 -6 0 0 Z" />
              <circle className="you-dot" cy={-17} r={4} />
              <text y={-32}>You</text>
            </g>
          );
        })()}
      </svg>

      {hovered && (
        <div className="map-hover" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hovered.title}</strong>
          {hovered.details.slice(0, 2).map((d, i) => d && <span key={i}>{d}</span>)}
          {featureFloors.get(hovered.id) && <span className="muted">{featureFloors.get(hovered.id)}</span>}
        </div>
      )}

      <div className="map-scale" aria-label={`Scale: ${scaleMetres} metres`}>
        <span style={{ width: scaleMetres * pxPerMetre }} />
        {scaleMetres} m
      </div>

      <div className="map-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(1.5)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button type="button" onClick={() => setView(fitView(projection.boundsRect, size.width, size.height))} aria-label="Fit map" title="Fit the whole map (0)">
          ⤢
        </button>
      </div>

      {config.author && (
        <div className="map-credit" onPointerDown={(e) => e.stopPropagation()}>
          Map by{' '}
          {config.authorLink ? (
            <a href={config.authorLink} target="_blank" rel="noreferrer">
              {config.author}
            </a>
          ) : (
            config.author
          )}{' '}
          via tarkov.dev
        </div>
      )}
    </div>
  );
}

function PinShape({ kind }: { kind: Feature['kind'] }) {
  switch (kind) {
    case 'extract':
      return <circle r={7} />;
    case 'transit':
      return <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" />;
    case 'spawn':
      return <path d="M 0 -7 L 6 5 L -6 5 Z" />;
    case 'boss':
      return <rect x={-6} y={-6} width={12} height={12} rx={2} />;
    case 'quest':
      return <path d="M 0 0 C -2 -4 -7 -7 -7 -11 A 7 7 0 1 1 7 -11 C 7 -7 2 -4 0 0 Z" />;
  }
}
