// ════════════════════════════════════════════════════════════════════════════
// Moon Code Desktop — Electron main process
// ════════════════════════════════════════════════════════════════════════════
// Spawns a local Moon Code server on 127.0.0.1 and loads it in a BrowserWindow.
// The server runs in a forked child process so we can cleanly shut it down
// when the app quits. Security: contextIsolation on, nodeIntegration off,
// sandbox on, spellcheck on.
// ════════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, shell, Menu, dialog, Tray, nativeImage } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

let server = null;
let mainWindow = null;
let tray = null;
// v3.4.0: Multi-window support — window registry
const windows = new Map(); // windowId → BrowserWindow
const port = process.env.MOONCODE_DESKTOP_PORT || '4173';
const isDev = !!process.env.MOONCODE_DESKTOP_DEV;
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// ─── Logging ────────────────────────────────────────────────────────────────
function log(...args) {
  console.log('[mooncode-desktop]', ...args);
}
function logError(...args) {
  console.error('[mooncode-desktop]', ...args);
}

// ─── Server lifecycle ───────────────────────────────────────────────────────
function getServerEntry() {
  // The app structure after `prepare.mjs` (with asar: false) is:
  //   resources/app/src/main.cjs       (this file)
  //   resources/app/server/src/server.js
  //   resources/app/packages/...
  //   resources/app/web/public/...
  // In dev (no prepare), the structure is:
  //   apps/desktop/src/main.cjs       (this file)
  //   apps/server/src/server.js       (monorepo)
  //   packages/...
  const candidates = [
    path.resolve(__dirname, '../server/src/server.js'),            // packaged: app/server/src
    path.resolve(__dirname, '../../server/src/server.js'),          // dev: apps/server/src
    path.resolve(__dirname, '../../../apps/server/src/server.js'),  // alt dev
    path.join(process.resourcesPath, 'app', 'server', 'src', 'server.js'), // extraResources
    path.join(process.resourcesPath, 'server', 'src', 'server.js'),       // flat extraResources
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      log('Server entry:', candidate);
      return candidate;
    }
  }
  logError('Could not find server entry. Tried:');
  candidates.forEach((c) => logError('  ', c));
  logError('__dirname:', __dirname);
  logError('resourcesPath:', process.resourcesPath || '(undefined)');
  return candidates[0];
}

function startLocalServer() {
  if (process.env.MOONCODE_DESKTOP_URL) {
    log('Using external server URL:', process.env.MOONCODE_DESKTOP_URL);
    return process.env.MOONCODE_DESKTOP_URL;
  }

  const serverEntry = getServerEntry();
  log('Starting local server:', serverEntry);

  if (!fs.existsSync(serverEntry)) {
    const msg = `Server entry not found:\n\n${serverEntry}\n\n__dirname: ${__dirname}\nresourcesPath: ${process.resourcesPath || '(undefined)'}`;
    logError(msg);
    dialog.showErrorBox('Moon Code — Server Not Found', msg);
    app.quit();
    return null;
  }

  const env = {
    ...process.env,
    MOONCODE_HOST: '127.0.0.1',
    MOONCODE_PORT: port,
    MOONCODE_DESKTOP: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    // Ensure Electron's Node.js can find the modules
    NODE_PATH: path.resolve(__dirname, '..', 'node_modules'),
  };

  let serverErrorOutput = '';

  server = fork(serverEntry, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  server.stdout?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) log('[server]', text);
  });
  server.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      serverErrorOutput += text + '\n';
      logError('[server]', text);
    }
  });
  server.on('exit', (code, signal) => {
    log(`Server exited (code=${code}, signal=${signal})`);
    server = null;
    if (code !== 0 && code !== null) {
      const errorMsg = `Moon Code server crashed (exit code ${code}).\n\nError output:\n${serverErrorOutput.slice(-1000)}`;
      logError(errorMsg);
      dialog.showErrorBox('Moon Code — Server Crashed', errorMsg);
    }
  });
  server.on('error', (error) => {
    logError('Server error:', error.message);
    dialog.showErrorBox('Moon Code Server Error', `Failed to start the local server:\n\n${error.message}`);
  });

  return `http://127.0.0.1:${port}`;
}

async function waitForServer(url, retries = 100) {
  let lastError = '';
  for (let i = 0; i < retries; i += 1) {
    // Check if the server process died
    if (server === null) {
      throw new Error(`Moon Code server process exited unexpectedly.\n\n${lastError}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        log('Server is healthy');
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Moon Code local service did not start at ${url} after ${retries} retries.\n\nLast error: ${lastError}`);
}

async function stopServer() {
  if (server && !server.killed) {
    log('Stopping server...');
    return new Promise((resolve) => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
      // Force-kill after 5 seconds if graceful shutdown fails.
      setTimeout(() => {
        if (server && !server.killed) {
          logError('Server did not exit gracefully, force-killing');
          server.kill('SIGKILL');
        }
        resolve();
      }, 5000).unref();
    });
  }
}

// ─── Window management ──────────────────────────────────────────────────────
async function createWindow() {
  const url = startLocalServer();
  try {
    await waitForServer(url);
  } catch (error) {
    logError(error.message);
    dialog.showErrorBox('Moon Code Startup Error', error.message);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#090a0c',
    show: false,
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      devTools: isDev,
    },
  });

  // Open external links in the system browser, not in the app.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  // Show window only when ready (prevents white flash).
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('close', (event) => {
    // On macOS, hide to tray instead of quitting (conventional behavior).
    if (isMac && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
  log('Window loaded');
}

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.resourcesPath, 'build/icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// ─── Tray (Linux + Windows) ─────────────────────────────────────────────────
function createTray() {
  if (isMac) return; // macOS uses the dock, no tray icon needed.
  const iconPath = getIconPath();
  if (!iconPath) return;
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip('Moon Code');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Moon Code', click: () => mainWindow?.show() },
    { label: 'Hide Moon Code', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

// ─── Application menu ───────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/qbrahym02-cmyk/mooncode#readme') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/qbrahym02-cmyk/mooncode/issues/new') },
        { label: 'Discussions', click: () => shell.openExternal('https://github.com/qbrahym02-cmyk/mooncode/discussions') },
        { type: 'separator' },
        { label: `Moon Code v${app.getVersion()}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow().then(createTray).catch((error) => {
    logError('Failed to create window:', error);
    dialog.showErrorBox('Moon Code Error', error.message);
    app.quit();
  });
}).catch((error) => {
  logError('App failed to start:', error);
  app.quit();
});

// macOS: re-create window when clicking the dock icon.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

// Quit when all windows are closed (except on macOS).
app.on('window-all-closed', () => {
  if (!isMac) {
    app.isQuitting = true;
    app.quit();
  }
});

// Clean up the server before quitting.
app.on('before-quit', async (event) => {
  if (server && !server.killed) {
    event.preventDefault();
    await stopServer();
    app.exit(0);
  }
});

// v3.4.0: Multi-window — create additional windows
ipcMain.handle('window-create', async (event, options = {}) => {
  const windowId = `win_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `http://127.0.0.1:${port}${options.path || '/'}`;
  const newWindow = new BrowserWindow({
    width: options.width || 1200, height: options.height || 800,
    titleBarStyle: isMac ? 'hiddenInset' : 'default', backgroundColor: '#090a0c', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: true, devTools: isDev, preload: path.join(__dirname, 'preload.cjs') },
  });
  windows.set(windowId, newWindow);
  newWindow.once('ready-to-show', () => newWindow.show());
  await newWindow.loadURL(url);
  log(`Window created: ${windowId}`);
  return { windowId };
});
ipcMain.handle('window-list', () => [...windows.keys()].map((id) => ({ id, title: windows.get(id).getTitle() })));
ipcMain.handle('window-close', (event, windowId) => { const w = windows.get(windowId); if (w) { w.close(); windows.delete(windowId); return { ok: true }; } return { ok: false }; });
ipcMain.handle('window-focus', (event, windowId) => { const w = windows.get(windowId); if (w) { w.show(); w.focus(); return { ok: true }; } return { ok: false }; });

// v3.0.0: Deep links — mooncode:// protocol
// Supports: mooncode://session/<id>, mooncode://open/<path>, mooncode://settings
app.setAsDefaultProtocolClient('mooncode');

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Check for deep link in command line (Windows)
  const deepLink = commandLine.find((arg) => arg.startsWith('mooncode://'));
  if (deepLink) {
    handleDeepLink(deepLink);
  }
  // Focus existing window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, '');
    log('Deep link:', url);

    if (parsed.hostname === 'session' && path) {
      // Open a specific session
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deep-link', { type: 'session', id: path });
      }
    } else if (parsed.hostname === 'open' && path) {
      // Open a workspace path
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deep-link', { type: 'open', path });
      }
    } else if (parsed.hostname === 'settings') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deep-link', { type: 'settings' });
      }
    }
  } catch (error) {
    logError('Deep link error:', error.message);
  }
}

// Prevent multiple instances of the app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logError('Another instance is already running');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
