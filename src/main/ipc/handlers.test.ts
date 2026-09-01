import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryStore } from '../history/store';
import { ProviderRegistry } from '../providers/registry';
import { TranslationProvider } from '../providers/types';
import { SettingsStore } from '../settings/store';
import { TTSProviderId } from '../settings/schema';
import { TTSProvider, TTSSpeakResult } from '../tts';
import { CHANNELS } from './channels';
import { ClipboardLike, IpcMainLike, NATURAL_VOICE_ADAPTER_URL, ShellLike, registerIpcHandlers } from './handlers';

function fakeProvider(id: string): TranslationProvider {
  return {
    id,
    translate: async (text) => ({ translatedText: `${id}:${text}` }),
    detectLanguage: async () => 'en',
    isHealthy: async () => true,
  };
}

function fakeTtsProvider(id: string, result: TTSSpeakResult): TTSProvider {
  return {
    id,
    speak: vi.fn().mockResolvedValue(result),
    stop: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(true),
    listVoices: vi.fn().mockResolvedValue([]),
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
  let ttsProviders: Record<TTSProviderId, TTSProvider>;
  let shell: ShellLike;
  let clipboard: ClipboardLike;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opentranslate-ipc-'));
    settingsStore = new SettingsStore(join(dir, 'settings.json'));
    historyStore = new HistoryStore(join(dir, 'history.json'));
    registry = new ProviderRegistry();
    registry.register(fakeProvider('good'));
    // DEFAULT_SETTINGS.tts.provider is 'bing-cloud' (issue #107) — matches
    // that here so "no explicit providerOverride" tests exercise the real
    // default instead of an arbitrary fake id.
    ttsProviders = {
      system: fakeTtsProvider('system', { kind: 'played' }),
      'google-cloud': fakeTtsProvider('google-cloud', { kind: 'audio', data: Buffer.from('google-audio'), mimeType: 'audio/mpeg' }),
      'bing-cloud': fakeTtsProvider('bing-cloud', { kind: 'audio', data: Buffer.from('bing-audio'), mimeType: 'audio/mpeg' }),
    };
    shell = { openExternal: vi.fn().mockResolvedValue(undefined) };
    clipboard = { writeText: vi.fn() };
    ipcMain = new FakeIpcMain();
    registerIpcHandlers(ipcMain, registry, settingsStore, historyStore, ttsProviders, shell, clipboard);
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
    registerIpcHandlers(anotherIpcMain, registry, settingsStore, historyStore, ttsProviders, shell, clipboard, onSettingsUpdated);

    await anotherIpcMain.invoke(CHANNELS.settingsUpdate, { hotkeys: { captureAndTranslate: 'Alt+G' } });

    expect(onSettingsUpdated).toHaveBeenCalledWith(expect.objectContaining({ hotkeys: { captureAndTranslate: 'Alt+G' } }));
  });

  it('tts:speak uses the saved provider setting by default and returns audio bytes as base64', async () => {
    const response = await ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', undefined);

    expect(ttsProviders['bing-cloud'].speak).toHaveBeenCalledWith('hello', 'en', undefined);
    expect(response).toEqual({ audioBase64: Buffer.from('bing-audio').toString('base64'), mimeType: 'audio/mpeg' });
  });

  it('tts:speak returns null when the provider plays audio itself (system)', async () => {
    const response = await ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', 'Microsoft Hazel Desktop', 'system');

    expect(ttsProviders.system.speak).toHaveBeenCalledWith('hello', 'en', 'Microsoft Hazel Desktop');
    expect(response).toBeNull();
  });

  it('tts:speak lets an explicit providerOverride win over the saved setting', async () => {
    await ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', undefined, 'google-cloud');

    expect(ttsProviders['google-cloud'].speak).toHaveBeenCalled();
    expect(ttsProviders['bing-cloud'].speak).not.toHaveBeenCalled();
  });

  it('tts:speak falls back to the system provider when the selected cloud provider throws', async () => {
    (ttsProviders['bing-cloud'].speak as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('endpoint unreachable'));

    const response = await ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', undefined);

    expect(ttsProviders.system.speak).toHaveBeenCalledWith('hello', 'en', undefined);
    expect(response).toBeNull();
  });

  it('tts:speak re-throws when the system provider itself fails (no further fallback)', async () => {
    (ttsProviders.system.speak as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('powershell not found'));

    await expect(ipcMain.invoke(CHANNELS.ttsSpeak, 'hello', 'en', undefined, 'system')).rejects.toThrow('powershell not found');
  });

  it('tts:stop always delegates to the system provider, regardless of the selected speak provider', async () => {
    await ipcMain.invoke(CHANNELS.ttsStop);
    expect(ttsProviders.system.stop).toHaveBeenCalled();
  });

  it('tts:list-voices always delegates to the system provider', async () => {
    (ttsProviders.system.listVoices as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'Microsoft Hazel Desktop', locale: 'en-GB', langCode: 'en', description: 'Hazel' }]);

    const voices = await ipcMain.invoke(CHANNELS.ttsListVoices);

    expect(voices).toEqual([{ name: 'Microsoft Hazel Desktop', locale: 'en-GB', langCode: 'en', description: 'Hazel' }]);
  });

  it('tts:open-natural-voice-adapter-page opens the fixed adapter URL, not an arbitrary one', async () => {
    await ipcMain.invoke(CHANNELS.ttsOpenNaturalVoiceAdapterPage, 'https://evil.example.com');
    expect(shell.openExternal).toHaveBeenCalledWith(NATURAL_VOICE_ADAPTER_URL);
    expect(shell.openExternal).not.toHaveBeenCalledWith('https://evil.example.com');
  });

  it('clipboard:write-text writes whatever text the renderer sends (issue #27)', async () => {
    await ipcMain.invoke(CHANNELS.clipboardWriteText, 'Привет, мир!');
    expect(clipboard.writeText).toHaveBeenCalledWith('Привет, мир!');
  });

  it('popup:grow-to-fit-content is a no-op when no callback was injected', () => {
    // The default beforeEach registration above omits the optional last
    // argument — this should not throw, just do nothing.
    expect(() => ipcMain.invoke(CHANNELS.popupGrowToFitContent, 500)).not.toThrow();
  });

  it('popup:grow-to-fit-content forwards the raw event and desired height to the injected callback (issue #134)', async () => {
    const growPopupToFitContent = vi.fn();
    const anotherIpcMain = new FakeIpcMain();
    registerIpcHandlers(anotherIpcMain, registry, settingsStore, historyStore, ttsProviders, shell, clipboard, undefined, growPopupToFitContent);

    await anotherIpcMain.invoke(CHANNELS.popupGrowToFitContent, 640);

    expect(growPopupToFitContent).toHaveBeenCalledWith({}, 640);
  });
});
