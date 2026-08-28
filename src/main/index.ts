import { app, ipcMain } from 'electron';
import { registerIpcHandlers } from './ipc/handlers';
import { createDefaultRegistry } from './providers';
import { createSettingsStore } from './settings';

// OpenTranslate lives in the tray. Tray/hotkey wiring is added by later
// issues (see PROGRESS.md); this is the placeholder entry point that lets
// the packaging and CI pipeline build something real from day one.
app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.whenReady().then(() => {
  const registry = createDefaultRegistry();
  const settingsStore = createSettingsStore();
  registerIpcHandlers(ipcMain, registry, settingsStore);

  // Tray creation and global shortcuts land here.
});
