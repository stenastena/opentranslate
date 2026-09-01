import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './index';

describe('createDefaultRegistry', () => {
  it('registers the four live providers, not Yandex (removed — issue #132)', () => {
    const registry = createDefaultRegistry();
    expect(registry.listProviderIds().sort()).toEqual(['bing', 'deepl', 'google', 'mymemory']);
  });
});
