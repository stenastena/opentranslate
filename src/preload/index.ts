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
  popupResize: 'popup:resize',
} as const;

const electronAPI = {
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    update: (partial: unknown) => ipcRenderer.invoke(CHANNELS.settingsUpdate, partial),
  },
  providers: {
    translate: (providerId: string, text: string, sourceLang: string, targetLang: string) =>
      ipcRenderer.invoke(CHANNELS.providerTranslate, providerId, text, sourceLang, targetLang),
    detectLanguage: (providerId: string, text: string) => ipcRenderer.invoke(CHANNELS.providerDetectLanguage, providerId, text),
    getLastSuccessAt: (providerId: string) => ipcRenderer.invoke(CHANNELS.providerLastSuccessAt, providerId),
    listIds: () => ipcRenderer.invoke(CHANNELS.providerListIds),
  },
  popup: {
    onCapturedText: (callback: (text: string) => void) => {
      ipcRenderer.on(CHANNELS.popupCapturedText, (_event, text: string) => callback(text));
    },
    reportSize: (width: number, height: number) => ipcRenderer.send(CHANNELS.popupResize, width, height),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
