// v3.4.0: Preload script — safely exposes IPC to the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  getVersion: () => ipcRenderer.invoke('get-version'),
  // v3.4.0: Multi-window
  windowCreate: (options) => ipcRenderer.invoke('window-create', options),
  windowList: () => ipcRenderer.invoke('window-list'),
  windowClose: (windowId) => ipcRenderer.invoke('window-close', windowId),
  windowFocus: (windowId) => ipcRenderer.invoke('window-focus', windowId),
  // v3.4.0: Deep link listener
  onDeepLink: (callback) => ipcRenderer.on('deep-link', callback),
});
