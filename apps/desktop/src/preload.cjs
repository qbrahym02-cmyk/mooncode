// v2.0.0: Preload script — safely exposes auto-updater IPC to the renderer.
// This runs in an isolated context and only exposes the minimum needed API.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Check for updates manually.
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  // Install a downloaded update (quits and restarts).
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Listen for update events from the main process.
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  // App info.
  getVersion: () => ipcRenderer.invoke('get-version'),
});
