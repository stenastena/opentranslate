import { app, clipboard, ipcMain } from 'electron';
import { registerCaptureHotkey, unregisterAllHotkeys } from './hotkeys';
import { registerIpcHandlers } from './ipc/handlers';
import { nutJsKeyEmulator } from './keyEmulator';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';
import { captureSelectedText } from './textCapture';
import { createTray } from './tray';
import { registerPopupIpc, showPopupWindow } from './windows/popupWindow';
import { showSettingsWindow } from './windows/settingsWindow';

app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.on('will-quit', unregisterAllHotkeys);

app.whenReady().then(() => {
  const registry = createDefaultRegistry();
  const settingsStore = createSettingsStore();

  const onCapture = async () => {
    const text = await captureSelectedText(clipboard, nutJsKeyEmulator);
    if (text.trim()) showPopupWindow(text);
  };

  registerIpcHandlers(ipcMain, registry, settingsStore, (updated) => {
    registerCaptureHotkey(updated.hotkeys.captureAndTranslate, onCapture);
  });
  registerPopupIpc(ipcMain);

  const settings = settingsStore.load();
  registerCaptureHotkey(settings.hotkeys.captureAndTranslate, onCapture);

  createTray(() => showSettingsWindow());
});
