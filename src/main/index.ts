import { app, clipboard, ipcMain } from 'electron';
import { createHistoryStore } from './history';
import { registerCaptureHotkey, unregisterAllHotkeys } from './hotkeys';
import { registerIpcHandlers } from './ipc/handlers';
import { nutJsKeyEmulator } from './keyEmulator';
import { installApplicationMenu } from './menu';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';
import { captureSelectedText } from './textCapture';
import { createTray } from './tray';
import { showHistoryWindow } from './windows/historyWindow';
import { showPopupWindow } from './windows/popupWindow';
import { showSettingsWindow } from './windows/settingsWindow';

app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.on('will-quit', unregisterAllHotkeys);

app.whenReady().then(() => {
  const registry = createDefaultRegistry();
  const settingsStore = createSettingsStore();
  const historyStore = createHistoryStore();

  const onCapture = async () => {
    console.log('[hotkey] capture triggered');
    try {
      const text = await captureSelectedText(clipboard, nutJsKeyEmulator);
      console.log('[hotkey] captured text:', JSON.stringify(text));
      if (text.trim()) showPopupWindow(text);
    } catch (error) {
      console.error('[hotkey] capture failed:', error);
    }
  };

  function applyHotkey(accelerator: string): void {
    const ok = registerCaptureHotkey(accelerator, onCapture);
    if (!ok) {
      console.error(`[hotkey] failed to register "${accelerator}" — it's likely already bound by another application.`);
    } else {
      console.log(`[hotkey] registered "${accelerator}"`);
    }
  }

  registerIpcHandlers(ipcMain, registry, settingsStore, historyStore, (updated) => {
    applyHotkey(updated.hotkeys.captureAndTranslate);
  });

  const settings = settingsStore.load();
  applyHotkey(settings.hotkeys.captureAndTranslate);

  createTray(
    () => showSettingsWindow(),
    () => showHistoryWindow(),
  );
  installApplicationMenu(
    () => showSettingsWindow(),
    () => showHistoryWindow(),
  );
});
