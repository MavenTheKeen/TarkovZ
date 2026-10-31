// Watches Escape from Tarkov's log folder and forwards quest and raid events
// to the window. Read-only: it only opens the game's text logs.

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { parseChunk } = require('./logParser.cjs');

const POLL_MS = 2000;
const LOG_FILES = /(application|push-notifications)_\d+\.log$/;
const DEFAULT_DIRS = [
  'C:\\Battlestate Games\\Escape from Tarkov\\Logs',
  'C:\\Battlestate Games\\EFT\\Logs',
  'D:\\Battlestate Games\\Escape from Tarkov\\Logs',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs',
];

async function isDir(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** The game's install folder from its uninstall registry entry (Windows only). */
function installFromRegistry() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const key = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EscapeFromTarkov';
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/v', 'InstallLocation'], { windowsHide: true }, (err, stdout) => {
      const m = !err && stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
      resolve(m ? m[1].trim() : null);
    });
  });
}

async function findLogsDir() {
  const install = await installFromRegistry();
  const candidates = install ? [path.join(install, 'Logs'), ...DEFAULT_DIRS] : DEFAULT_DIRS;
  for (const dir of candidates) if (await isDir(dir)) return dir;
  return null;
}

/** Session folders, oldest first (their names start with the date). */
async function sessionDirs(logsDir) {
  const names = await fs.readdir(logsDir).catch(() => []);
  const dirs = [];
  for (const name of names) {
    const full = path.join(logsDir, name);
    if (name.startsWith('log_') && (await isDir(full))) dirs.push(full);
  }
  return dirs.sort();
}

async function logFiles(sessionDir) {
  const names = await fs.readdir(sessionDir).catch(() => []);
  return names.filter((n) => LOG_FILES.test(n)).map((n) => path.join(sessionDir, n));
}

/**
 * Every quest event in every session, oldest first: for importing past
 * progress. `since` (ms) skips older events, e.g. from before a wipe.
 */
async function readHistory(logsDir, since = 0) {
  const events = [];
  for (const dir of await sessionDirs(logsDir)) {
    for (const file of await logFiles(dir)) {
      const text = await fs.readFile(file, 'utf8').catch(() => '');
      events.push(...parseChunk(text, { final: true }).events.filter((e) => e.kind === 'quest' && e.time >= since));
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

class LogWatcher {
  constructor(send) {
    this.send = send;
    this.logsDir = null;
    this.session = null;
    /** Per file: bytes already read and any unfinished entry. */
    this.files = new Map();
    this.timer = null;
  }

  status() {
    return { logsDir: this.logsDir, session: this.session && path.basename(this.session), watching: !!this.timer };
  }

  async start(logsDir) {
    this.stop();
    this.logsDir = logsDir || (await findLogsDir());
    if (!this.logsDir || !(await isDir(this.logsDir))) {
      this.logsDir = null;
      return this.status();
    }
    // Skip whatever is already in the current session: only new events matter.
    const dirs = await sessionDirs(this.logsDir);
    this.session = dirs[dirs.length - 1] ?? null;
    if (this.session) {
      for (const file of await logFiles(this.session)) {
        const size = (await fs.stat(file).catch(() => ({ size: 0 }))).size;
        this.files.set(file, { offset: size, rest: '' });
      }
    }
    this.timer = setInterval(() => this.poll().catch(() => undefined), POLL_MS);
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.files.clear();
  }

  async poll() {
    const dirs = await sessionDirs(this.logsDir);
    const newest = dirs[dirs.length - 1];
    // The game started a new session: read it from the beginning.
    if (newest && newest !== this.session) {
      this.session = newest;
      this.files.clear();
      this.send({ kind: 'session', session: path.basename(newest) });
    }
    if (!this.session) return;
    const events = [];
    for (const file of await logFiles(this.session)) {
      const state = this.files.get(file) ?? { offset: 0, rest: '' };
      const size = (await fs.stat(file)).size;
      if (size < state.offset) state.offset = 0; // the file was replaced
      if (size > state.offset) {
        const handle = await fs.open(file, 'r');
        try {
          const buffer = Buffer.alloc(size - state.offset);
          await handle.read(buffer, 0, buffer.length, state.offset);
          const parsed = parseChunk(state.rest + buffer.toString('utf8'));
          state.rest = parsed.rest;
          events.push(...parsed.events);
        } finally {
          await handle.close();
        }
        state.offset = size;
      }
      this.files.set(file, state);
    }
    events.sort((a, b) => a.time - b.time).forEach((e) => this.send(e));
  }
}

module.exports = { LogWatcher, findLogsDir, readHistory };
