import { HistoryStore, NewHistoryEntry } from '../history';
import { ProviderRegistry } from '../providers';
import { AppSettings, SettingsStore, TTSProviderId } from '../settings';
import { TTSProvider } from '../tts';
import { CHANNELS } from './channels';

// What the ttsSpeak handler hands back to the renderer over IPC — see
// TTSSpeakResult in tts/types.ts for the main-process-side shape this is
// derived from. null means the selected provider already produced sound
// itself (systemProvider.ts, via PowerShell/SAPI) and there's nothing left
// for the renderer to do; a populated object means the renderer must play
// these bytes itself (the cloud providers — see popup.ts).
export interface TTSSpeakResponse {
  audioBase64: string;
  mimeType: string;
}

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
  ttsProviders: Record<TTSProviderId, TTSProvider>,
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

  ipcMain.handle(CHANNELS.ttsSpeak, async (_event, text: string, lang?: string, voiceName?: string, providerOverride?: TTSProviderId): Promise<TTSSpeakResponse | null> => {
    // providerOverride lets a caller pin a specific provider regardless of
    // the saved setting — Settings' per-language SAPI "Test" button uses
    // this to force 'system' (it's testing one specific installed voice,
    // which only systemProvider.ts even understands), and its own
    // provider-selector "Test" button uses it to try an in-progress,
    // not-yet-saved choice. Ordinary popup speak clicks pass none, so they
    // always follow whatever's actually saved.
    const providerId = providerOverride ?? settingsStore.load().tts.provider;
    const provider = ttsProviders[providerId] ?? ttsProviders.system;

    const toResponse = (result: Awaited<ReturnType<TTSProvider['speak']>>): TTSSpeakResponse | null =>
      result.kind === 'audio' ? { audioBase64: result.data.toString('base64'), mimeType: result.mimeType } : null;

    try {
      return toResponse(await provider.speak(text, lang, voiceName));
    } catch (error) {
      if (provider === ttsProviders.system) throw error; // no further fallback available
      console.error(`[tts] ${providerId} failed, falling back to system voice`, error);
      return toResponse(await ttsProviders.system.speak(text, lang, voiceName));
    }
  });

  ipcMain.handle(CHANNELS.ttsStop, () => ttsProviders.system.stop());

  ipcMain.handle(CHANNELS.ttsListVoices, () => ttsProviders.system.listVoices());

  ipcMain.handle(CHANNELS.ttsOpenNaturalVoiceAdapterPage, () => shell.openExternal(NATURAL_VOICE_ADAPTER_URL));
}
