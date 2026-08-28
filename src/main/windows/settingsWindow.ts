import { BrowserWindow } from 'electron';
import { join } from 'node:path';

let settingsWindow: BrowserWindow | null = null;

export function showSettingsWindow(): BrowserWindow {
  if (settingsWindow) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const win = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    title: 'OpenTranslate Settings',
    webPreferences: {
      preload: join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[settings]', message);
  });

  win.on('closed', () => {
    if (settingsWindow === win) settingsWindow = null;
  });

  settingsWindow = win;
  return win;
}
