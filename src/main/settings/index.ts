import { app } from 'electron';
import { join } from 'node:path';
import { SettingsStore } from './store';

export function createSettingsStore(): SettingsStore {
  return new SettingsStore(join(app.getPath('userData'), 'settings.json'));
}

export * from './schema';
export { SettingsStore } from './store';
