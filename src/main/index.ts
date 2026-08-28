import { app } from 'electron';

// OpenTranslate lives in the tray. Tray/hotkey/IPC wiring is added by later
// issues (see PROGRESS.md); this is the placeholder entry point that lets
// the packaging and CI pipeline build something real from day one.
app.on('window-all-closed', () => {
  // Intentionally not quitting: the app is only reachable via the tray icon.
});

app.whenReady().then(() => {
  // Tray creation, global shortcuts and provider wiring land here.
});
