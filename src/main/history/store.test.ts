import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NewHistoryEntry } from './schema';
import { HistoryStore } from './store';

function makeEntry(overrides: Partial<NewHistoryEntry> = {}): NewHistoryEntry {
  return {
    originalText: 'hello',
    sourceLang: 'en',
    targetLang: 'de',
    providerId: 'deepl',
    translatedText: 'Hallo',
    ...overrides,
  };
}

describe('HistoryStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opentranslate-history-'));
    filePath = join(dir, 'nested', 'history.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list when no file exists yet', () => {
    const store = new HistoryStore(filePath);
    expect(store.list()).toEqual([]);
  });

  it('adds an entry with a generated id and timestamp, newest first', () => {
    const store = new HistoryStore(filePath);

    const first = store.add(makeEntry({ originalText: 'hello' }));
    const second = store.add(makeEntry({ originalText: 'world' }));

    expect(first.id).toBeTruthy();
    expect(first.timestamp).toBeGreaterThan(0);

    const list = store.list();
    expect(list.map((e) => e.originalText)).toEqual(['world', 'hello']);
  });

  it('persists across store instances', () => {
    const store = new HistoryStore(filePath);
    store.add(makeEntry());

    const reloaded = new HistoryStore(filePath).list();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].translatedText).toBe('Hallo');
  });

  it('removes a single entry by id', () => {
    const store = new HistoryStore(filePath);
    const first = store.add(makeEntry({ originalText: 'hello' }));
    store.add(makeEntry({ originalText: 'world' }));

    store.remove(first.id);

    expect(store.list().map((e) => e.originalText)).toEqual(['world']);
  });

  it('clears all entries', () => {
    const store = new HistoryStore(filePath);
    store.add(makeEntry());
    store.add(makeEntry());

    store.clear();

    expect(store.list()).toEqual([]);
  });

  it('caps stored entries at 500, dropping the oldest', () => {
    const store = new HistoryStore(filePath);
    for (let i = 0; i < 505; i++) {
      store.add(makeEntry({ originalText: `text-${i}` }));
    }

    const list = store.list();
    expect(list).toHaveLength(500);
    expect(list[0].originalText).toBe('text-504');
    expect(list[499].originalText).toBe('text-5');
  });

  it('falls back to an empty list and logs when the file contains invalid JSON', () => {
    const store = new HistoryStore(filePath);
    store.add(makeEntry());
    writeFileSync(filePath, '{not valid json', 'utf-8');

    expect(store.list()).toEqual([]);
  });

  it('falls back to an empty list when the file contains valid JSON that is not an array', () => {
    const store = new HistoryStore(filePath);
    store.add(makeEntry());
    writeFileSync(filePath, '{"not":"an array"}', 'utf-8');

    expect(store.list()).toEqual([]);
  });
});
