import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppSettings, DEFAULT_SETTINGS } from './schema';

/**
 * Plain JSON-file-backed settings storage. Deliberately not electron-store:
 * this needs to be constructible and testable outside the Electron runtime.
 * The file path (normally somewhere under app.getPath('userData')) is
 * supplied by the caller — see createSettingsStore() for the real wiring.
 */
export class SettingsStore {
  constructor(private readonly filePath: string) {}

  load(): AppSettings {
    if (!existsSync(this.filePath)) {
      return structuredClone(DEFAULT_SETTINGS);
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) };
    } catch (error) {
      console.error(`[settings] failed to read ${this.filePath}, falling back to defaults`, error);
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  save(settings: AppSettings): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  update(partial: Partial<AppSettings>): AppSettings {
    const merged = { ...this.load(), ...partial };
    this.save(merged);
    return merged;
  }
}
