import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import { createHistoryStore } from './history';
import { registerCaptureHotkey, unregisterAllHotkeys } from './hotkeys';
import { registerIpcHandlers } from './ipc/handlers';
import { nutJsKeyEmulator } from './keyEmulator';
import { installApplicationMenu } from './menu';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';
import { captureSelectedText } from './textCapture';
import { bingCloudTtsProvider, googleCloudTtsProvider, systemTtsProvider } from './tts';
import { createTray } from './tray';
import { showHistoryWindow } from './windows/historyWindow';
import { growPopupHeightToFit, onPopupBoundsSettled, primeLastBounds, showPopupWindow } from './windows/popupWindow';
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
      // Security audit (2026-09-01): never log the actual captured text —
      // it's arbitrary clipboard/selection content the user may not want
      // to see echoed anywhere, even to an ephemeral dev-mode console
      // (a password manager entry, personal message, etc.). Length alone
      // is enough to confirm the capture worked / came back empty.
      console.log('[hotkey] captured text length:', text.length);
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

  // Issue #136: applied on startup and again on every settings save, so
  // toggling it in Settings takes effect immediately without an app
  // restart. openAsHidden only affects macOS login items — harmless to
  // pass unconditionally on Windows, which is this app's only target.
  function applyStartWithWindows(enabled: boolean): void {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
  }

  const ttsProviders = {
    system: systemTtsProvider,
    'google-cloud': googleCloudTtsProvider,
    'bing-cloud': bingCloudTtsProvider,
  };

  registerIpcHandlers(
    ipcMain,
    registry,
    settingsStore,
    historyStore,
    ttsProviders,
    shell,
    clipboard,
    (updated) => {
      applyHotkey(updated.hotkeys.captureAndTranslate);
      applyStartWithWindows(updated.advanced.startWithWindows);
    },
    (event, desiredContentHeight) => {
      const win = BrowserWindow.fromWebContents((event as Electron.IpcMainInvokeEvent).sender);
      if (win) growPopupHeightToFit(win, desiredContentHeight);
    },
  );

  const settings = settingsStore.load();
  applyHotkey(settings.hotkeys.captureAndTranslate);
  applyStartWithWindows(settings.advanced.startWithWindows);

  // Issue #151: remember the popup's position/size across app restarts,
  // not just across captures within one running session (which
  // popupWindow.ts's own in-memory tracking already did).
  primeLastBounds(settings.popup.lastBounds);
  onPopupBoundsSettled((bounds) => {
    settingsStore.update({ popup: { lastBounds: bounds } });
  });

  createTray(showMainWindow);
  installApplicationMenu(
    () => showSettingsWindow(),
    () => showHistoryWindow(),
  );
});
