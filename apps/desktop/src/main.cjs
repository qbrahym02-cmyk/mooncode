const { app, BrowserWindow, shell } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');

let server;
const port = process.env.ZETORA_DESKTOP_PORT || '4173';

function startLocalServer() {
  if (process.env.ZETORA_DESKTOP_URL) return process.env.ZETORA_DESKTOP_URL;
  const serverEntry = path.resolve(__dirname, '../../server/src/server.js');
  server = fork(serverEntry, [], {
    env: { ...process.env, ZETORA_HOST: '127.0.0.1', ZETORA_PORT: port },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  server.stdout?.pipe(process.stdout);
  server.stderr?.pipe(process.stderr);
  return `http://127.0.0.1:${port}`;
}

async function waitForServer(url, retries = 80) {
  for (let index = 0; index < retries; index += 1) {
    try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Zetora local service did not start');
}

async function createWindow() {
  const url = startLocalServer();
  await waitForServer(url);
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#090a0c',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(url);
}

app.whenReady().then(createWindow).catch((error) => { console.error(error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => { if (server && !server.killed) server.kill('SIGTERM'); });
