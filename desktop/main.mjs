import { app, BrowserWindow, dialog, shell } from 'electron';
import { startWorkbench } from '../src/workbench.mjs';

let mainWindow;
let workbench;
let quitting = false;

async function closeWorkbench() {
  const active = workbench;
  workbench = undefined;
  if (active) await active.close();
}

async function createWindow() {
  workbench = await startWorkbench({ port: 0, gatewayPort: 0 });
  const studioUrl = new URL(workbench.studioUrl);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'PixelMug Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destination = new URL(url);
      if (destination.protocol === 'http:' || destination.protocol === 'https:') void shell.openExternal(destination.href);
    } catch {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === studioUrl.origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  await mainWindow.loadURL(studioUrl.href);
}

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('PixelMug Studio could not start', error.stack || error.message);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', event => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  closeWorkbench().catch(() => {}).finally(() => app.exit());
});