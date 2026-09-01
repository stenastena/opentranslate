import { contextBridge, ipcRenderer } from 'electron';

// Duplicated from src/main/ipc/channels.ts rather than imported: preload
// scripts run sandboxed by default, and a sandboxed preload's require() can't
// load arbitrary local files (only Electron's small built-in allowlist) —
// importing this would fail at runtime with "module not found" even though
// it resolves fine at compile time. Keep the two in sync by hand.
const CHANNELS = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  providerTranslate: 'provider:translate',
  providerDetectLanguage: 'provider:detect-language',
  providerLastSuccessAt: 'provider:last-success-at',
  providerListIds: 'provider:list-ids',
  popupCapturedText: 'popup:captured-text',
  popupGrowToFitContent: 'popup:grow-to-fit-content',
  historyList: 'history:list',
  historyAdd: 'history:add',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  ttsSpeak: 'tts:speak',
  ttsStop: 'tts:stop',
  ttsListVoices: 'tts:list-voices',
  ttsOpenNaturalVoiceAdapterPage: 'tts:open-natural-voice-adapter-page',
  clipboardWriteText: 'clipboard:write-text',
} as const;

const electronAPI = {
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    update: (partial: unknown) => ipcRenderer.invoke(CHANNELS.settingsUpdate, partial),
  },
  providers: {
    translate: (providerId: string, text: string, sourceLang: string, targetLang: string, options?: { lightweight?: boolean; skipCache?: boolean }) =>
      ipcRenderer.invoke(CHANNELS.providerTranslate, providerId, text, sourceLang, targetLang, options),
    detectLanguage: (providerId: string, text: string) => ipcRenderer.invoke(CHANNELS.providerDetectLanguage, providerId, text),
    getLastSuccessAt: (providerId: string) => ipcRenderer.invoke(CHANNELS.providerLastSuccessAt, providerId),
    listIds: () => ipcRenderer.invoke(CHANNELS.providerListIds),
  },
  popup: {
    onCapturedText: (callback: (text: string) => void) => {
      ipcRenderer.on(CHANNELS.popupCapturedText, (_event, text: string) => callback(text));
    },
    growToFitContent: (desiredContentHeight: number) => ipcRenderer.invoke(CHANNELS.popupGrowToFitContent, desiredContentHeight),
  },
  history: {
    list: () => ipcRenderer.invoke(CHANNELS.historyList),
    add: (entry: { originalText: string; sourceLang: string; targetLang: string; providerId: string; translatedText: string }) =>
      ipcRenderer.invoke(CHANNELS.historyAdd, entry),
    remove: (id: string) => ipcRenderer.invoke(CHANNELS.historyRemove, id),
    clear: () => ipcRenderer.invoke(CHANNELS.historyClear),
  },
  tts: {
    speak: (text: string, lang?: string, voiceName?: string, providerOverride?: string) =>
      ipcRenderer.invoke(CHANNELS.ttsSpeak, text, lang, voiceName, providerOverride),
    stop: () => ipcRenderer.invoke(CHANNELS.ttsStop),
    listVoices: () => ipcRenderer.invoke(CHANNELS.ttsListVoices),
    openNaturalVoiceAdapterPage: () => ipcRenderer.invoke(CHANNELS.ttsOpenNaturalVoiceAdapterPage),
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke(CHANNELS.clipboardWriteText, text),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
