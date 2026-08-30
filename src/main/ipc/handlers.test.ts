import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryStore } from '../history/store';
import { ProviderRegistry } from '../providers/registry';
import { TranslationProvider } from '../providers/types';
import { SettingsStore } from '../settings/store';
import { TTSProvider } from '../tts';
import { CHANNELS } from './channels';
import { IpcMainLike, registerIpcHandlers } from './handlers';

function fakeProvider(id: string): TranslationProvider {
  return {
    id,
    translate: async (text) => ({ translatedText: `${id}:${text}` }),
    detectLanguage: async () => 'en',
    isHealthy: async () => true,
  };
}

class FakeIpcMain implements IpcMainLike {
  private readonly listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void {
    this.listeners.set(channel, listener);
  }

  invoke(channel: string, ...args: unknown[]): unknown {
    const listener = this.listeners.get(channel);
    if (!listener) throw new Error(`no handler registered for ${channel}`);
    return listener({}, ...args);
  }
}

describe('registerIpcHandlers', () => {
  let dir: string;
  let settingsStore: SettingsStore;
  let historyStore: HistoryStore;
  let registry: ProviderRegistry;
  let ipcMain: FakeIpcMain;
  let ttsProvider: TTSProvider;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opentranslate-ipc-'));
    settingsStore = new SettingsStore(join(dir, 'settings.json'));
    historyStore = new HistoryStore(join(dir, 'history.json'));
    registry = new ProviderRegistry();
    registry.register(fakeProvider('good'));
    ttsProvider = {
      id: 'fake',
      speak: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockResolvedValue(true),
      listVoices: vi.fn().mockResolvedValue([]),
    };
    ipcMain = new FakeIpcMain();
    registerIpcHandlers(ipcMain, registry, settingsStore, historyStore, ttsProvider);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('settings:get returns the current settings', async () => {
    const result = await ipcMain.invoke(CHANNELS.settingsGet);
    expect(result).toEqual(settingsStore.load());
  });

  it('settings:update persists and returns the merged settings', async () => {
    const result = await ipcMain.invoke(CHANNELS.settingsUpdate, { hotkeys: { captureAndTranslate: 'Alt+T' } });
    expect((result as { hotkeys: { captureAndTranslate: string } }).hotkeys.captureAndTranslate).toBe('Alt+T');
    expect(settingsStore.load().hotkeys.captureAndTranslate).toBe('Alt+T');
  });

  it('provider:translate delegates to the registry and isolates provider failures', async () => {
    const ok = await ipcMain.invoke(CHANNELS.providerTranslate, 'good', 'hi', 'en', 'de');
    expect(ok).toEqual({ ok: true, value: { translatedText: 'good:hi' } });

    const fail = await ipcMain.invoke(CHANNELS.providerTranslate, 'missing', 'hi', 'en', 'de');
    expect(fail).toEqual({ ok: false, error: 'Unknown provider: missing' });
  });

  it('provider:list-ids returns the registered provider ids', async () => {
    const ids = await ipcMain.invoke(CHANNELS.providerListIds);
    expect(ids).toEqual(['good']);
  });

  it('provider:last-success-at reflects registry state', async () => {
    expect(await ipcMain.invoke(CHANNELS.providerLastSuccessAt, 'good')).toBeNull();
    await ipcMain.invoke(CHANNELS.providerTranslate, 'good', 'hi', 'en', 'de');
    expect(await ipcMain.invoke(CHANNELS.providerLastSuccessAt, 'good')).not.toBeNull();
  });

  it('history:add persists an entry and history:list returns it newest-first', async () => {
    await ipcMain.invoke(CHANNELS.historyAdd, {
      originalText: 'hello',
      sourceLang: 'en',
      targetLang: 'de',
      providerId: 'good',
      translatedText: 'Hallo',
    });

    const list = (await ipcMain.invoke(CHANNELS.historyList)) as Array<{ originalText: string }>;
    expect(list).toHaveLength(1);
    expect(list[0].originalText).toBe('hello');
    expect(historyStore.list()).toHaveLength(1);
  });

  it('history:remove deletes a single entry by id', async () => {
    const added = (await ipcMain.invoke(CHANNELS.historyAdd, {
      originalText: 'hello',
      sourceLang: 'en',
      targetLang: 'de',
      providerId: 'good',
      translatedText: 'Hallo',
    })) as { id: string };

    await ipcMain.invoke(CHANNELS.historyRemove, added.id);

    expect(await ipcMain.invoke(CHANNELS.historyList)).toEqual([]);
  });

  it('history:clear empties the history', async () => {
    await ipcMain.invoke(CHANNELS.historyAdd, {
      originalText: 'hello',
      sourceLang: 'en',
      targetLang: 'de',
      providerId: 'good',
      translatedText: 'Hallo',
    });

    await ipcMain.invoke(CHANNELS.historyClear);

    expect(await ipcMain.invoke(CHANNELS.historyList)).toEqual([]);
  });

  it('settings:update invokes the onSettingsUpdated callback with the merged settings', async () => {
    const onSettingsUpdated = vi.fn();
    const anotherIpcMain = new FakeIpcMain();
    registerIpcHandlers(anotherIpcMain, registry, settingsStore, historyStore, ttsProvider, onSettingsUpdated);

    await anotherIpcMain.invoke(CHANNELS.settingsUpdate, { hotkeys: { captureAndTranslate: 'Alt+G' } });

    expect(onSettingsUpdated).toHaveBeenCalledWith(expect.objectContaining({ hotkeys: { captureAndTranslate: 'Alt+G' } }));
  });

  it('tts:speak delegates to the TTS provider', async () => {
    await ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', 'Microsoft Hazel Desktop');
    expect(ttsProvider.speak).toHaveBeenCalledWith('hello', 'en', 'Microsoft Hazel Desktop');
  });

  it('tts:stop delegates to the TTS provider', async () => {
    await ipcMain.invoke(CHANNELS.ttsStop);
    expect(ttsProvider.stop).toHaveBeenCalled();
  });

  it('tts:list-voices delegates to the TTS provider', async () => {
    (ttsProvider.listVoices as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'Microsoft Hazel Desktop', locale: 'en-GB', langCode: 'en', description: 'Hazel' }]);

    const voices = await ipcMain.invoke(CHANNELS.ttsListVoices);

    expect(voices).toEqual([{ name: 'Microsoft Hazel Desktop', locale: 'en-GB', langCode: 'en', description: 'Hazel' }]);
  });
});
