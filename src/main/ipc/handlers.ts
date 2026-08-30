import { HistoryStore, NewHistoryEntry } from '../history';
import { ProviderRegistry } from '../providers';
import { AppSettings, SettingsStore } from '../settings';
import { TTSProvider } from '../tts';
import { CHANNELS } from './channels';

// Matches the subset of Electron's IpcMain we actually use, so this module
// (and its handlers) can be unit-tested without the Electron runtime.
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

// Matches the subset of Electron's shell module used here — injected
// rather than imported directly, for the same testability reason as
// IpcMainLike above.
export interface ShellLike {
  openExternal(url: string): Promise<void>;
}

// Fixed, not an arbitrary URL accepted from the renderer: this is the only
// external link this app ever opens, so there's no reason to expose a
// generic "open any URL" IPC surface for a renderer bug (or future
// unrelated code) to call with something unexpected.
export const NATURAL_VOICE_ADAPTER_URL = 'https://github.com/gexgd0419/NaturalVoiceSAPIAdapter';

export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  registry: ProviderRegistry,
  settingsStore: SettingsStore,
  historyStore: HistoryStore,
  ttsProvider: TTSProvider,
  shell: ShellLike,
  onSettingsUpdated?: (settings: AppSettings) => void,
): void {
  ipcMain.handle(CHANNELS.settingsGet, () => settingsStore.load());

  ipcMain.handle(CHANNELS.settingsUpdate, (_event, partial) => {
    const updated = settingsStore.update(partial);
    onSettingsUpdated?.(updated);
    return updated;
  });

  ipcMain.handle(CHANNELS.providerTranslate, (_event, providerId, text, sourceLang, targetLang, options) =>
    registry.translate(providerId, text, sourceLang, targetLang, options),
  );

  ipcMain.handle(CHANNELS.providerDetectLanguage, (_event, providerId, text) => registry.detectLanguage(providerId, text));

  ipcMain.handle(CHANNELS.providerLastSuccessAt, (_event, providerId) => registry.getLastSuccessAt(providerId));

  ipcMain.handle(CHANNELS.providerListIds, () => registry.listProviderIds());

  ipcMain.handle(CHANNELS.historyList, () => historyStore.list());

  ipcMain.handle(CHANNELS.historyAdd, (_event, entry: NewHistoryEntry) => historyStore.add(entry));

  ipcMain.handle(CHANNELS.historyRemove, (_event, id: string) => historyStore.remove(id));

  ipcMain.handle(CHANNELS.historyClear, () => historyStore.clear());

  ipcMain.handle(CHANNELS.ttsSpeak, (_event, text: string, lang?: string, voiceName?: string) => ttsProvider.speak(text, lang, voiceName));

  ipcMain.handle(CHANNELS.ttsStop, () => ttsProvider.stop());

  ipcMain.handle(CHANNELS.ttsListVoices, () => ttsProvider.listVoices());

  ipcMain.handle(CHANNELS.ttsOpenNaturalVoiceAdapterPage, () => shell.openExternal(NATURAL_VOICE_ADAPTER_URL));
}
