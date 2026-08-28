import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../ipc/channels';
import { IpcMainLike } from '../ipc/handlers';

let popupWindow: BrowserWindow | null = null;
let ipcRegistered = false;

/**
 * Registers the resize handler once, globally. It targets whichever window
 * sent the message (BrowserWindow.fromWebContents), so it works regardless
 * of how many times the popup window is recreated.
 */
export function registerPopupIpc(ipcMain: IpcMainLike & { on(channel: string, listener: (event: { sender: unknown }, ...args: any[]) => void): void }): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on(CHANNELS.popupResize, (event, width: number, height: number) => {
    const win = BrowserWindow.fromWebContents(event.sender as Electron.WebContents);
    win?.setContentSize(Math.ceil(width), Math.ceil(height), true);
  });
}

export function showPopupWindow(capturedText: string): BrowserWindow {
  popupWindow?.close();

  const cursor = screen.getCursorScreenPoint();

  const win = new BrowserWindow({
    x: cursor.x,
    y: cursor.y,
    width: 420,
    height: 220,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
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

  // "Close on click outside the window": losing OS focus is exactly that,
  // for a frameless always-on-top popup with no other UI to click into.
  win.on('blur', () => win.close());

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') win.close();
  });

  win.on('closed', () => {
    if (popupWindow === win) popupWindow = null;
  });

  popupWindow = win;
  return win;
}
