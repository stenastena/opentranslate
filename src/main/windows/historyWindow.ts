import { BrowserWindow } from 'electron';
import { join } from 'node:path';

let historyWindow: BrowserWindow | null = null;

export function showHistoryWindow(): BrowserWindow {
  if (historyWindow) {
    historyWindow.focus();
    return historyWindow;
  }

  const win = new BrowserWindow({
    width: 560,
    height: 520,
    title: 'OpenTranslate History',
    webPreferences: {
      preload: join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(join(__dirname, '..', '..', 'renderer', 'history', 'index.html'));

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[history-window]', message);
  });

  win.on('closed', () => {
    if (historyWindow === win) historyWindow = null;
  });

  historyWindow = win;
  return win;
}
