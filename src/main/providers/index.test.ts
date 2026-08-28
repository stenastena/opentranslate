import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './index';

describe('createDefaultRegistry', () => {
  it('registers all three MVP providers', () => {
    const registry = createDefaultRegistry();
    expect(registry.listProviderIds().sort()).toEqual(['deepl', 'google', 'yandex']);
  });
});
