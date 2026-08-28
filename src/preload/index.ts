import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../main/ipc/channels';

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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
