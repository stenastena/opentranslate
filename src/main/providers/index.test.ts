import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './index';

describe('createDefaultRegistry', () => {
  it('registers all four providers', () => {
    const registry = createDefaultRegistry();
    expect(registry.listProviderIds().sort()).toEqual(['bing', 'deepl', 'google', 'yandex']);
  });
});
