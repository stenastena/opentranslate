import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../providers/registry';
import { TranslationProvider } from '../providers/types';
import { SettingsStore } from '../settings/store';
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
  let registry: ProviderRegistry;
  let ipcMain: FakeIpcMain;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opentranslate-ipc-'));
    settingsStore = new SettingsStore(join(dir, 'settings.json'));
    registry = new ProviderRegistry();
    registry.register(fakeProvider('good'));
    ipcMain = new FakeIpcMain();
    registerIpcHandlers(ipcMain, registry, settingsStore);
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
});
