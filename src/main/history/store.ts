import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HistoryEntry, NewHistoryEntry } from './schema';

// Caps how many past translations are kept — otherwise the file (and the
// eventual viewer list) grows without bound over the life of an install.
// Comfortably more than anyone would scroll through, but small enough that
// the JSON file stays trivial to read/write on every entry.
const MAX_ENTRIES = 500;

/**
 * Plain JSON-file-backed history storage, newest entry first. Deliberately
 * not electron-store, matching SettingsStore — needs to be constructible
 * and testable outside the Electron runtime. The file path (normally
 * somewhere under app.getPath('userData')) is supplied by the caller — see
 * createHistoryStore() for the real wiring.
 */
export class HistoryStore {
  constructor(private readonly filePath: string) {}

  list(): HistoryEntry[] {
    if (!existsSync(this.filePath)) {
      return [];
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`[history] failed to read ${this.filePath}, treating history as empty`, error);
      return [];
    }
  }

  add(entry: NewHistoryEntry): HistoryEntry {
    const fullEntry: HistoryEntry = { ...entry, id: randomUUID(), timestamp: Date.now() };
    const updated = [fullEntry, ...this.list()].slice(0, MAX_ENTRIES);
    this.save(updated);
    return fullEntry;
  }

  remove(id: string): void {
    this.save(this.list().filter((entry) => entry.id !== id));
  }

  clear(): void {
    this.save([]);
  }

  private save(entries: HistoryEntry[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(entries, null, 2), 'utf-8');
  }
}
