import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from './registry';
import { TranslationProvider } from './types';

function fakeProvider(id: string, overrides: Partial<TranslationProvider> = {}): TranslationProvider {
  return {
    id,
    translate: async (text) => ({ translatedText: `${id}:${text}` }),
    detectLanguage: async () => 'en',
    isHealthy: async () => true,
    ...overrides,
  };
}

describe('ProviderRegistry', () => {
  it('returns a translated result for a healthy provider and records lastSuccessAt', async () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('good'));

    expect(registry.getLastSuccessAt('good')).toBeNull();

    const result = await registry.translate('good', 'hello', 'en', 'de');

    expect(result).toEqual({ ok: true, value: { translatedText: 'good:hello' } });
    expect(registry.getLastSuccessAt('good')).not.toBeNull();
  });

  it('isolates a throwing provider: it fails without throwing, and does not affect other providers', async () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('broken', {
      translate: async () => {
        throw new Error('service changed its response format');
      },
    }));
    registry.register(fakeProvider('good'));

    const brokenResult = await registry.translate('broken', 'hello', 'en', 'de');
    expect(brokenResult).toEqual({ ok: false, error: 'service changed its response format' });
    expect(registry.getLastSuccessAt('broken')).toBeNull();

    const goodResult = await registry.translate('good', 'hello', 'en', 'de');
    expect(goodResult.ok).toBe(true);
  });

  it('reports an unknown provider id as a failed result rather than throwing', async () => {
    const registry = new ProviderRegistry();
    const result = await registry.translate('nope', 'hello', 'en', 'de');
    expect(result).toEqual({ ok: false, error: 'Unknown provider: nope' });
  });

  it('checkHealth reflects the provider health check result', async () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('flaky', { isHealthy: async () => false }));

    const result = await registry.checkHealth('flaky');
    expect(result).toEqual({ ok: true, value: false });
  });
});
