import { globalShortcut } from 'electron';

/**
 * Registers the single global capture hotkey, replacing whatever was
 * registered before (used both at startup and whenever the user rebinds it
 * in Settings → Hotkeys). Returns whether registration succeeded — it can
 * fail if another application already owns that key combination.
 */
export function registerCaptureHotkey(accelerator: string, callback: () => void): boolean {
  globalShortcut.unregisterAll();
  return globalShortcut.register(accelerator, callback);
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
}
