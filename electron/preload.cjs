// Exposes only the disk cache and the game-log watcher to the renderer; no
// Node access beyond this.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  cacheRead: (key) => ipcRenderer.invoke('cache:read', key),
  cacheWrite: (key, value) => ipcRenderer.invoke('cache:write', key, value),
  gameLog: {
    start: (dir) => ipcRenderer.invoke('gamelog:start', dir ?? null),
    stop: () => ipcRenderer.invoke('gamelog:stop'),
    status: () => ipcRenderer.invoke('gamelog:status'),
    history: (dir, since) => ipcRenderer.invoke('gamelog:history', dir ?? null, since ?? 0),
    chooseFolder: () => ipcRenderer.invoke('gamelog:choose'),
    onEvent: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('gamelog:event', listener);
      return () => ipcRenderer.removeListener('gamelog:event', listener);
    },
  },
});
