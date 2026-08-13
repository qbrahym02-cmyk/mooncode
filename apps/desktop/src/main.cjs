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
  // In production (packaged), the server is bundled as extraResource.
  // In dev, it's in the parent monorepo.
  const candidates = [
    path.resolve(__dirname, '../../server/src/server.js'),       // dev monorepo
    path.resolve(__dirname, '../../../apps/server/src/server.js'), // packaged relative
    path.join(process.resourcesPath, 'apps/server/src/server.js'), // extraResources
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  logError('Could not find server entry. Tried:', candidates);
  return candidates[0]; // return first as fallback (will fail with clear error)
}

function startLocalServer() {
  if (process.env.MOONCODE_DESKTOP_URL) {
    log('Using external server URL:', process.env.MOONCODE_DESKTOP_URL);
    return process.env.MOONCODE_DESKTOP_URL;
  }

  const serverEntry = getServerEntry();
  log('Starting local server:', serverEntry);

  const env = {
    ...process.env,
    MOONCODE_HOST: '127.0.0.1',
    MOONCODE_PORT: port,
    MOONCODE_DESKTOP: '1',
    NODE_ENV: isDev ? 'development' : 'production',
  };

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
    if (text) logError('[server]', text);
  });
  server.on('exit', (code, signal) => {
    log(`Server exited (code=${code}, signal=${signal})`);
    server = null;
  });
  server.on('error', (error) => {
    logError('Server error:', error.message);
    dialog.showErrorBox('Moon Code Server Error', `Failed to start the local server:\n\n${error.message}`);
  });

  return `http://127.0.0.1:${port}`;
}

async function waitForServer(url, retries = 100) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        log('Server is healthy');
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Moon Code local service did not start at ${url} after ${retries} retries`);
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

// Ensure server stops even on sudden termination.
app.on('will-quit', () => {
  if (server && !server.killed) {
    server.kill('SIGKILL');
  }
});

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
