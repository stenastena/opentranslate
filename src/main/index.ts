import { app, clipboard, ipcMain } from 'electron';
import { registerCaptureHotkey, unregisterAllHotkeys } from './hotkeys';
import { registerIpcHandlers } from './ipc/handlers';
import { nutJsKeyEmulator } from './keyEmulator';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';
import { captureSelectedText } from './textCapture';
import { createTray } from './tray';
import { registerPopupIpc, showPopupWindow } from './windows/popupWindow';

// OpenTranslate lives in the tray. The settings window is added by a later
// issue (see PROGRESS.md); this is the entry point it attaches to.
app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.on('will-quit', unregisterAllHotkeys);

app.whenReady().then(() => {
  const registry = createDefaultRegistry();
  const settingsStore = createSettingsStore();
  registerIpcHandlers(ipcMain, registry, settingsStore);
  registerPopupIpc(ipcMain);

  const onCapture = async () => {
    const text = await captureSelectedText(clipboard, nutJsKeyEmulator);
    if (text.trim()) showPopupWindow(text);
  };

  const settings = settingsStore.load();
  registerCaptureHotkey(settings.hotkeys.captureAndTranslate, onCapture);

  createTray(() => {
    // The settings window lands in a later issue.
    console.log('[tray] Open Settings clicked');
  });
});
