import { useEffect, useMemo, useRef, useState } from 'react';
import { useLookups, useMapConfigs, useMapSvg } from '../api/data';
import { findMapConfig } from '../api/transform';
import MapView, { type MapPick } from '../components/MapView';
import SearchBox from '../components/SearchBox';
import ExtractsPanel from '../components/ExtractsPanel';
import MapQuestsPanel from '../components/MapQuestsPanel';
import HerePanel from '../components/HerePanel';
import RaidPanel from '../components/RaidPanel';
import { buildFeatures, type Feature, type FeatureKind } from '../lib/mapFeatures';
import { distance2d, pointInPolygon } from '../lib/geometry';
import { floorOf } from '../lib/floors';
import { buildSearchIndex, type SearchEntry } from '../lib/search';
import { useNav } from '../lib/nav';
import { useProgress } from '../lib/progress';
import { useSettings } from '../lib/settings';
import { createStore, useStore } from '../lib/store';
import { lastMapStore } from '../lib/userData';
import type { GamePoint } from '../lib/projection';

type LayerKey = FeatureKind | 'labels';
const LAYER_LABELS: Record<LayerKey, string> = {
  extract: 'Extracts',
  transit: 'Transits',
  quest: 'Quests',
  spawn: 'Spawns',
  boss: 'Bosses',
  labels: 'Labels',
};
// v2: spawns start hidden, since they cover the map and only matter when marking a spawn.
const layersStore = createStore<Record<LayerKey, boolean>>('tarkovz.layers.v2', {
  extract: true,
  transit: true,
  quest: true,
  spawn: false,
  boss: true,
  labels: true,
});

/** Quest markers for every unfinished quest, or only the ones you can take now. */
const questScopeStore = createStore<'available' | 'all'>('tarkovz.questScope.v1', 'available');

type Panel = 'raid' | 'extracts' | 'quests' | 'here';
const PANEL_LABELS: Record<Panel, string> = { raid: 'Raid', extracts: 'Extracts', quests: 'Quests', here: 'Here' };
const sidebarStore = createStore<boolean>('tarkovz.sidebarOpen.v1', true);

export interface HereState {
  point: GamePoint;
  features: Feature[];
}

export default function MapScreen() {
  const settings = useSettings();
  const mode = settings.gameMode;
  const { maps, tasks, items, lookups } = useLookups(mode);
  const configs = useMapConfigs();
  const progress = useProgress(mode);
  const nav = useNav();
  const layers = useStore(layersStore);
  const questScope = useStore(questScopeStore);
  const lastMap = useStore(lastMapStore);

  const mapList = maps.data?.data ?? [];
  const [mapId, setMapId] = useState<string | null>(lastMap);
  const map =
    mapList.find((m) => m.id === mapId) ?? mapList.find((m) => m.normalizedName === 'customs') ?? mapList[0];
  const config = map && configs.data ? findMapConfig(configs.data.data, map.normalizedName) : undefined;
  const svg = useMapSvg(config?.svgPath);
  // Read by focusOn, which can run a frame after the map changes.
  const configRef = useRef(config);
  configRef.current = config;

  const [floor, setFloor] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('raid');
  const sidebarOpen = useStore(sidebarStore);
  const [layersOpen, setLayersOpen] = useState(false);
  const [here, setHere] = useState<HereState | null>(null);
  const [you, setYou] = useState<GamePoint | null>(null);
  const [focus, setFocus] = useState<{ points: GamePoint[]; nonce: number } | null>(null);
  const [highlight, setHighlight] = useState<GamePoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [pinMode, setPinMode] = useState(false);

  // Esc leaves pin mode.
  useEffect(() => {
    if (!pinMode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinMode(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinMode]);

  const dropPin = (point: GamePoint) => {
    setYou(point);
    setPinMode(false);
    setPanel('extracts');
    if (!sidebarStore.get()) sidebarStore.set(true);
  };

  const chooseMap = (id: string) => {
    if (id === map?.id) return;
    setMapId(id);
    lastMapStore.set(id);
    setFloor(null);
    setHere(null);
    setYou(null);
    setPinMode(false);
    // A focus from the previous map would point at the wrong place.
    setFocus(null);
    setHighlight([]);
    setSelectedId(undefined);
  };

  const focusOn = (points: GamePoint[], highlightPoints = points) => {
    setFocus({ points, nonce: Date.now() });
    setHighlight(highlightPoints);
    // Switch to the floor the points are on, when they share one.
    const c = configRef.current;
    if (!c) return;
    const floors = new Set(points.map((p) => floorOf(c, p)).filter((fl) => fl !== undefined));
    if (floors.size === 1) setFloor([...floors][0]!);
  };

  // "Show on map" requests from other screens.
  useEffect(() => {
    const f = nav.focus;
    if (!f) return;
    chooseMap(f.mapId);
    // Wait a frame so the new map's view is fitted before zooming in.
    requestAnimationFrame(() => focusOn(f.points));
    if (f.questId) setPanel('quests');
  }, [nav.focus?.nonce]);

  const features = useMemo(
    () =>
      map
        ? buildFeatures(map, tasks.data?.data.tasks ?? [], progress, settings, lookups, questScope === 'available')
        : [],
    [map, tasks.data, progress, settings.side, settings.faction, settings.playerLevel, lookups, questScope],
  );
  const visible = useMemo(() => features.filter((f) => layers[f.kind]), [features, layers]);

  const searchIndex = useMemo(
    () => buildSearchIndex(mapList, tasks.data?.data.tasks ?? [], lookups.questItems, items.data?.byId),
    [mapList, tasks.data, items.data, lookups.questItems],
  );

  const onPick = (pick: MapPick) => {
    const hits = visible.filter(
      (f) =>
        f.id === pick.featureId ||
        distance2d(f.position, pick.point) <= pick.radius ||
        (f.outline && pointInPolygon(pick.point, f.outline)),
    );
    hits.sort((a, b) => Number(b.id === pick.featureId) - Number(a.id === pick.featureId));
    setHere({ point: pick.point, features: hits });
    setSelectedId(pick.featureId);
    setPanel('here');
    if (!sidebarStore.get()) sidebarStore.set(true);
  };

  const onSearch = (entry: SearchEntry) => {
    chooseMap(entry.mapId);
    if (entry.points.length) requestAnimationFrame(() => focusOn(entry.points));
    if (entry.questId) setPanel('quests');
  };

  const loading = maps.isPending || configs.isPending;
  const error = maps.error ?? configs.error;

  return (
    <div className="map-screen">
      <div className="map-toolbar">
        <select className="location" value={map?.id ?? ''} onChange={(e) => chooseMap(e.target.value)} aria-label="Location">
          {mapList.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <SearchBox index={searchIndex} onSelect={onSearch} />
        <div className="popover-anchor">
          <button type="button" className={layersOpen ? 'active' : ''} onClick={() => setLayersOpen((v) => !v)}>
            Layers ▾
          </button>
          {layersOpen && (
            <div className="popover layers-popover">
              {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
                <label key={key} className={`check layer-${key}`}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => layersStore.set((l) => ({ ...l, [key]: !l[key] }))}
                  />
                  <span className="swatch" />
                  {LAYER_LABELS[key]}
                </label>
              ))}
              {layers.quest && (
                <div className="segmented small" role="group" aria-label="Which quests">
                  {(['available', 'all'] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      className={questScope === scope ? 'active' : ''}
                      title={scope === 'available' ? 'Quests whose prerequisites are done, at your level' : 'Every unfinished quest'}
                      onClick={() => questScopeStore.set(scope)}
                    >
                      {scope === 'available' ? 'Can do now' : 'All'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-button sidebar-toggle"
          onClick={() => sidebarStore.set(!sidebarOpen)}
          title={sidebarOpen ? 'Hide the side panel' : 'Show the side panel'}
          aria-label={sidebarOpen ? 'Hide the side panel' : 'Show the side panel'}
        >
          {sidebarOpen ? '⟩' : '⟨'}
        </button>
      </div>

      <div className="map-body">
        <div className="map-area">
          {loading && <p className="note center">Loading map data…</p>}
          {error && !maps.data && <p className="note error center">Couldn't load map data. ({error.message})</p>}
          {map && configs.data && !config && (
            <p className="note center">No map image is available for {map.name} yet. Extracts are listed in the panel.</p>
          )}
          {map && config && (
            <MapView
              key={config.key}
              config={config}
              svgText={svg.data}
              floor={floor}
              features={visible}
              showLabels={layers.labels}
              highlight={highlight}
              selectedId={selectedId}
              marker={you}
              focus={focus}
              onPick={onPick}
              pinMode={pinMode}
              onDropPin={dropPin}
            />
          )}
          {svg.isError && <p className="note error map-overlay-note">Couldn't load the map image.</p>}

          {config && config.layers.length > 0 && (
            <div className="map-overlay floor-bar" role="group" aria-label="Floor" onPointerDown={(e) => e.stopPropagation()}>
              {[null, ...config.layers.map((l) => l.name)].map((name) => (
                <button key={name ?? 'ground'} type="button" className={floor === name ? 'active' : ''} onClick={() => setFloor(name)}>
                  {name ?? 'Ground'}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className={`map-overlay pin-fab${pinMode ? ' active' : ''}`}
            onClick={() => setPinMode((v) => !v)}
            title="Mark where you spawned: click this, then click the map (or right-click the map any time)"
          >
            {pinMode ? 'Click the map… Esc to cancel' : you ? '📍 Move my pin' : '📍 Mark my spawn'}
          </button>
        </div>

        {sidebarOpen && (
        <aside className="map-side">
          <div className="tabs small">
            {(Object.keys(PANEL_LABELS) as Panel[]).map((p) => (
              <button key={p} type="button" className={panel === p ? 'active' : ''} onClick={() => setPanel(p)}>
                {PANEL_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {map && panel === 'raid' && <RaidPanel map={map} onFocus={(pts) => focusOn(pts)} />}
            {map && panel === 'here' && (
              <HerePanel
                here={here}
                mode={mode}
                onSetPosition={(p) => {
                  setYou(p);
                  setPanel('extracts');
                }}
                onShowQuest={(questId) => {
                  const pts = features.filter((f) => f.questId === questId).map((f) => f.position);
                  focusOn(pts);
                  setPanel('quests');
                }}
              />
            )}
            {map && panel === 'extracts' && (
              <ExtractsPanel
                map={map}
                lookups={lookups}
                you={you}
                onSetPosition={setYou}
                onFocus={(p) => focusOn([p])}
              />
            )}
            {map && panel === 'quests' && (
              <MapQuestsPanel
                map={map}
                tasks={tasks.data?.data.tasks ?? []}
                features={features}
                lookups={lookups}
                onFocus={(pts) => focusOn(pts)}
              />
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
