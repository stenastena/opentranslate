import { app, clipboard, ipcMain, shell } from 'electron';
import { createHistoryStore } from './history';
import { registerCaptureHotkey, unregisterAllHotkeys } from './hotkeys';
import { registerIpcHandlers } from './ipc/handlers';
import { nutJsKeyEmulator } from './keyEmulator';
import { installApplicationMenu } from './menu';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';
import { captureSelectedText } from './textCapture';
import { systemTtsProvider } from './tts';
import { createTray } from './tray';
import { showHistoryWindow } from './windows/historyWindow';
import { showPopupWindow } from './windows/popupWindow';
import { showSettingsWindow } from './windows/settingsWindow';

// The popup is this app's "main window" — the tray and hotkey both funnel
// through this same function, just with a different argument (see
// showPopupWindow's own comment for what capturedText's presence/absence
// means).
function showMainWindow(): void {
  showPopupWindow();
}

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
      // Always show the popup, even with nothing selected (text === '') —
      // it's the app's main window, and the user should still be able to
      // reach it via the hotkey to type something in manually.
      showPopupWindow(text);
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

  registerIpcHandlers(ipcMain, registry, settingsStore, historyStore, systemTtsProvider, shell, (updated) => {
    applyHotkey(updated.hotkeys.captureAndTranslate);
  });

  const settings = settingsStore.load();
  applyHotkey(settings.hotkeys.captureAndTranslate);

  createTray(showMainWindow);
  installApplicationMenu(
    () => showSettingsWindow(),
    () => showHistoryWindow(),
  );
});
