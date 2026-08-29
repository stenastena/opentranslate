import { app } from 'electron';
import { join } from 'node:path';
import { HistoryStore } from './store';

export function createHistoryStore(): HistoryStore {
  return new HistoryStore(join(app.getPath('userData'), 'history.json'));
}

export * from './schema';
export { HistoryStore } from './store';
