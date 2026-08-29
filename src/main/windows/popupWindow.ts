import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../ipc/channels';

let popupWindow: BrowserWindow | null = null;

export function showPopupWindow(capturedText: string): BrowserWindow {
  popupWindow?.close();

  const cursor = screen.getCursorScreenPoint();

  const win = new BrowserWindow({
    x: cursor.x,
    y: cursor.y,
    width: 480,
    height: 360,
    frame: true,
    resizable: true,
    // Per issue #69: the popup must behave like a normal window — it
    // should not float over whatever the user switches to, and losing
    // focus must not close it (only Esc does). alwaysOnTop:true and a
    // close-on-blur handler both actively fought that; removed.
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(join(__dirname, '..', '..', 'renderer', 'popup', 'index.html'));

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[popup]', message);
  });

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send(CHANNELS.popupCapturedText, capturedText);
  });

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') win.close();
  });

  win.on('closed', () => {
    if (popupWindow === win) popupWindow = null;
  });

  popupWindow = win;
  return win;
}
