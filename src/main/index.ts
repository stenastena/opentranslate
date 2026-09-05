import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
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
import { growPopupHeightToFit, onPopupBoundsSettled, primeLastBounds, reloadPopupWindow, setQuitting, showPopupWindow } from './windows/popupWindow';
import { showSettingsWindow } from './windows/settingsWindow';

// The popup is this app's "main window" — the tray and hotkey both funnel
// through this same function, just with a different argument (see
// showPopupWindow's own comment for what capturedText's presence/absence
// means).
function showMainWindow(): void {
  showPopupWindow();
}

const GITHUB_URL = 'https://github.com/stenastena/opentranslate';

// Electron's native app.showAboutPanel()/setAboutPanelOptions() only work
// on macOS and Linux — there's no equivalent native "About" panel on
// Windows, this app's only target platform — so a plain message box is
// the actual cross-Windows-version way to show this. app.getVersion()
// reads package.json's "version" the same way electron-builder's
// packaged build does, so this never needs updating by hand alongside a
// version bump.
function showAboutDialog(): void {
  const result = dialog.showMessageBoxSync({
    type: 'info',
    title: 'About OpenTranslate',
    message: `OpenTranslate ${app.getVersion()}`,
    detail: `A tray-based Windows desktop translator.\n\nAuthor: Sergey Osherov\nLicense: Apache License 2.0\n© ${new Date().getFullYear()} Sergey Osherov\n\n${GITHUB_URL}`,
    buttons: ['OK', 'Open GitHub'],
    defaultId: 0,
    noLink: true,
  });
  if (result === 1) void shell.openExternal(GITHUB_URL);
}

app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.on('will-quit', unregisterAllHotkeys);

// Issue #159: the popup window now hides instead of closing (so captures
// after the first one reuse its already-loaded renderer instead of
// paying to rebuild it) — this lets a genuine quit (tray Exit / File >
// Exit) actually close it instead of being blocked by that same
// hide-not-close interception.
app.on('before-quit', () => setQuitting(true));

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
      // Issue #159: the popup window now persists and is reused across
      // captures instead of being rebuilt from scratch each time (the
      // fix for the slow-hotkey-appearance bug) — its renderer no longer
      // naturally re-reads settings on every capture the way a freshly
      // built one used to, so a theme/font/default-provider/etc. change
      // needs this explicit nudge to actually show up before the next
      // full app restart.
      reloadPopupWindow();
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
    showAboutDialog,
  );
});
