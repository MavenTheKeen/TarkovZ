// Electron main process. The app is a normal window: it never reads or injects
// into the game process, and there is no transparent overlay. With the user's
// opt-in it reads the game's text log files from disk, nothing more.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { LogWatcher, findLogsDir, readHistory } = require('./logWatcher.cjs');

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const cacheDir = () => path.join(app.getPath('userData'), 'api-cache');

// Cache keys come from the renderer, so restrict them to a safe file name.
function cacheFile(key) {
  if (typeof key !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(key)) {
    throw new Error(`Invalid cache key: ${key}`);
  }
  return path.join(cacheDir(), `${key}.json`);
}

ipcMain.handle('cache:read', async (_event, key) => {
  try {
    return JSON.parse(await fs.readFile(cacheFile(key), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('cache:write', async (_event, key, value) => {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(cacheFile(key), JSON.stringify(value), 'utf8');
});

// Game log watching. The folder comes from the renderer, so it must be an
// existing directory; nothing outside it is read.
let mainWindow = null;
const watcher = new LogWatcher((event) => mainWindow?.webContents.send('gamelog:event', event));

async function validDir(dir) {
  if (dir == null) return null;
  if (typeof dir !== 'string') throw new Error('Invalid folder');
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('Folder not found');
  return dir;
}

ipcMain.handle('gamelog:start', async (_event, dir) => watcher.start(await validDir(dir)));
ipcMain.handle('gamelog:stop', () => {
  watcher.stop();
  return watcher.status();
});
ipcMain.handle('gamelog:status', () => watcher.status());
ipcMain.handle('gamelog:history', async (_event, dir, since) => {
  const logsDir = (await validDir(dir)) ?? (await findLogsDir());
  return logsDir ? readHistory(logsDir, Number.isFinite(since) ? since : 0) : [];
});
ipcMain.handle('gamelog:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the Escape from Tarkov Logs folder',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

function createWindow() {
  const win = (mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#14161a',
    title: 'TarkovZ',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Open external links (wiki etc.) in the default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
