import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './schema';
import { SettingsStore } from './store';

describe('SettingsStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opentranslate-settings-'));
    filePath = join(dir, 'nested', 'settings.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when no file exists yet', () => {
    const store = new SettingsStore(filePath);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and reloads a partial update, merged with existing settings', () => {
    const store = new SettingsStore(filePath);

    const afterFirstUpdate = store.update({ hotkeys: { captureAndTranslate: 'Alt+T' } });
    expect(afterFirstUpdate.hotkeys.captureAndTranslate).toBe('Alt+T');
    expect(afterFirstUpdate.languages).toEqual(DEFAULT_SETTINGS.languages);

    const reloaded = new SettingsStore(filePath).load();
    expect(reloaded.hotkeys.captureAndTranslate).toBe('Alt+T');

    const afterSecondUpdate = store.update({ services: { deepl: false, yandex: true, google: true } });
    expect(afterSecondUpdate.hotkeys.captureAndTranslate).toBe('Alt+T');
    expect(afterSecondUpdate.services.deepl).toBe(false);
  });

  it('falls back to defaults and logs when the file contains invalid JSON', () => {
    const store = new SettingsStore(filePath);
    store.save(DEFAULT_SETTINGS);
    writeFileSync(filePath, '{not valid json', 'utf-8');

    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });
});
