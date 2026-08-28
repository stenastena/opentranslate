import { ProviderRegistry } from '../providers';
import { AppSettings, SettingsStore } from '../settings';
import { CHANNELS } from './channels';

// Matches the subset of Electron's IpcMain we actually use, so this module
// (and its handlers) can be unit-tested without the Electron runtime.
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  registry: ProviderRegistry,
  settingsStore: SettingsStore,
  onSettingsUpdated?: (settings: AppSettings) => void,
): void {
  ipcMain.handle(CHANNELS.settingsGet, () => settingsStore.load());

  ipcMain.handle(CHANNELS.settingsUpdate, (_event, partial) => {
    const updated = settingsStore.update(partial);
    onSettingsUpdated?.(updated);
    return updated;
  });

  ipcMain.handle(CHANNELS.providerTranslate, (_event, providerId, text, sourceLang, targetLang) =>
    registry.translate(providerId, text, sourceLang, targetLang),
  );

  ipcMain.handle(CHANNELS.providerDetectLanguage, (_event, providerId, text) => registry.detectLanguage(providerId, text));

  ipcMain.handle(CHANNELS.providerLastSuccessAt, (_event, providerId) => registry.getLastSuccessAt(providerId));

  ipcMain.handle(CHANNELS.providerListIds, () => registry.listProviderIds());
}
