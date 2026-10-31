import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useLookups, useTraders } from './api/data';
import MapScreen from './screens/MapScreen';
import QuestsScreen from './screens/QuestsScreen';
import FleaScreen from './screens/FleaScreen';
import AmmoScreen from './screens/AmmoScreen';
import HideoutScreen from './screens/HideoutScreen';
import BartersScreen from './screens/BartersScreen';
import { importHistory, toastStore, updateGameLog, useGameLogState, useGameLogWatcher } from './lib/gameLog';
import { setTab, useNav, type Tab } from './lib/nav';
import { useStore } from './lib/store';
import { formatClock, useRaidTimer, useSecondsLeft } from './lib/raidTimer';
import { updateSettings, useSettings } from './lib/settings';
import { formatAge } from './lib/time';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'quests', label: 'Quests' },
  { id: 'flea', label: 'Items' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'hideout', label: 'Hideout' },
  { id: 'barters', label: 'Barters' },
];

export default function App() {
  const { tab } = useNav();
  const settings = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const { maps, lookups } = useLookups(settings.gameMode);
  useGameLogWatcher(settings, lookups.tasks, maps.data?.data ?? []);

  // Ctrl+K (or Cmd+K) jumps to the current screen's search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.main input[type="search"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>TarkovZ</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <RaidPill />
          <OfflineBadge />
          <button
            type="button"
            className="mode-pill"
            title="Switch between PvP and PvE data"
            onClick={() => updateSettings({ gameMode: settings.gameMode === 'regular' ? 'pve' : 'regular' })}
          >
            {settings.gameMode === 'regular' ? 'PvP' : 'PvE'}
          </button>
          <div className="popover-anchor">
            <button
              type="button"
              className={`icon-button${showSettings ? ' active' : ''}`}
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
              aria-label="Settings"
              title="Settings"
            >
              ⚙
            </button>
            {showSettings && <SettingsPopover onClose={() => setShowSettings(false)} />}
          </div>
        </div>
      </header>
      <main className={`main main-${tab}`}>
        {tab === 'map' && <MapScreen />}
        {tab === 'quests' && <QuestsScreen />}
        {tab === 'flea' && <FleaScreen />}
        {tab === 'ammo' && <AmmoScreen />}
        {tab === 'hideout' && <HideoutScreen />}
        {tab === 'barters' && <BartersScreen />}
      </main>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const toasts = useStore(toastStore);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Settings for reading the game's own log files. */
function GameLogSettings() {
  const s = useSettings();
  const state = useGameLogState();
  const { lookups } = useLookups(s.gameMode);
  const [importing, setImporting] = useState<string | null>(null);
  const [since, setSince] = useState('');
  const available = !!window.desktop?.gameLog;
  const opts = s.gameLog;

  const runImport = async () => {
    setImporting('Reading past logs…');
    try {
      const added = await importHistory(s, lookups.tasks, since ? new Date(`${since}T00:00`).getTime() : 0);
      setImporting(added ? `Marked ${added} quests done from your logs.` : 'Your quest list was already up to date.');
    } catch (err) {
      setImporting((err as Error).message);
    }
  };

  return (
    <section>
      <h3>Game logs</h3>
      {!available && <span className="muted small">Only available in the desktop app.</span>}
      {available && (
        <>
          <label className="check">
            <input type="checkbox" checked={opts.enabled} onChange={() => updateGameLog({ enabled: !opts.enabled })} />
            Read Tarkov's log files
          </label>
          <span className="muted small">Read-only: never touches the game. Updates between raids.</span>
          {opts.enabled && (
            <>
              <div className="log-status small">
                {state.error ? (
                  <span className="warn">{state.error}</span>
                ) : state.status?.logsDir ? (
                  <span className="up">● Watching {state.status.session ? 'the current session' : 'for a game session'}</span>
                ) : (
                  <span className="muted">Starting…</span>
                )}
                {state.last && <span className="muted"> · {state.last}</span>}
              </div>
              <label className="check">
                <input type="checkbox" checked={opts.autoQuests} onChange={() => updateGameLog({ autoQuests: !opts.autoQuests })} />
                Tick quests as you finish them
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.autoMap} onChange={() => updateGameLog({ autoMap: !opts.autoMap })} />
                Open the raid's map when you load in
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.autoTimer} onChange={() => updateGameLog({ autoTimer: !opts.autoTimer })} />
                Run the raid timer automatically
              </label>
            </>
          )}
          <details className="more">
            <summary>Import past progress, logs folder</summary>
            <div className="row">
              <button type="button" onClick={runImport} disabled={!lookups.tasks.size}>
                Import past progress
              </button>
              <label className="field small" title="Skip logs from before the last wipe">
                from
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button
                type="button"
                className="link-button"
                onClick={async () => {
                  const folder = await window.desktop!.gameLog.chooseFolder();
                  if (folder) updateGameLog({ folder });
                }}
                title={opts.folder ?? state.status?.logsDir ?? 'Found automatically'}
              >
                {opts.folder ? 'Change logs folder' : 'Choose logs folder'}
              </button>
            </div>
            {importing && <span className="muted small">{importing}</span>}
          </details>
        </>
      )}
    </section>
  );
}

/** The running raid's clock, visible from every screen. */
function RaidPill() {
  const timer = useRaidTimer();
  const left = useSecondsLeft(timer);
  if (!timer || left === null) return null;
  return (
    <button
      type="button"
      className={`raid-pill${left < 300 ? ' urgent' : ''}`}
      title={`Raid on ${timer.mapName}`}
      onClick={() => setTab('map')}
    >
      {timer.mapName} {formatClock(left)}
    </button>
  );
}

/** Only shown when data is a saved copy because the network failed. */
function OfflineBadge() {
  const { gameMode } = useSettings();
  const { maps, tasks, items } = useLookups(gameMode);
  const stale = [maps.data, tasks.data, items.data].filter((d) => d?.fromCache);
  if (!stale.length) return null;
  const oldest = Math.min(...stale.map((d) => d!.fetchedAt));
  return (
    <span className="offline-badge" title={`Showing saved data from ${formatAge(oldest)}`}>
      Offline
    </span>
  );
}

/** "12 min" or "1 h 5 min" until a time. */
function untilText(iso: string, now: number) {
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function SettingsPopover({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const fetching = useIsFetching();
  const client = useQueryClient();
  const traders = useTraders(s.gameMode);
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const restocks = (traders.data?.data ?? [])
    .filter((t) => t.resetTime && Date.parse(t.resetTime) > now - 60_000)
    .sort((a, b) => Date.parse(a.resetTime!) - Date.parse(b.resetTime!));

  return (
    <div className="popover settings-popover" ref={ref}>
      <section>
        <h3>Your character</h3>
        <div className="row">
          <label className="field">
            Level
            <input
              type="number"
              min={1}
              max={79}
              value={s.playerLevel}
              onChange={(e) => updateSettings({ playerLevel: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <div className="segmented small" role="group" aria-label="Faction">
            {(['USEC', 'BEAR'] as const).map((f) => (
              <button key={f} type="button" className={s.faction === f ? 'active' : ''} onClick={() => updateSettings({ faction: f })}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3>Flea fees</h3>
        <label className="check">
          <input type="checkbox" checked={s.intelCenter3} onChange={() => updateSettings({ intelCenter3: !s.intelCenter3 })} />
          Intelligence Center level 3
        </label>
        <label className="field">
          Hideout Management skill
          <input
            type="number"
            min={0}
            max={51}
            value={s.hideoutManagement}
            disabled={!s.intelCenter3}
            onChange={(e) => updateSettings({ hideoutManagement: Math.min(51, Math.max(0, Number(e.target.value) || 0)) })}
          />
        </label>
      </section>

      <GameLogSettings />

      {restocks.length > 0 && (
        <details className="more">
          <summary>
            Trader restocks · next: {restocks[0].name} in {untilText(restocks[0].resetTime!, now)}
          </summary>
          <ul className="restocks">
            {restocks.map((t) => {
              return (
                <li key={t.id}>
                  <span>{t.name}</span>
                  <span className="muted">{untilText(t.resetTime!, now)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <section className="row between">
        <span className="muted small">Data from tarkov.dev. Progress stays on this computer.</span>
        <button type="button" disabled={fetching > 0} onClick={() => client.invalidateQueries()}>
          {fetching > 0 ? 'Updating…' : 'Refresh data'}
        </button>
      </section>
    </div>
  );
}
