import { afterEach, describe, expect, it, vi } from 'vitest';
import { yandexProvider } from './yandex';

function mockFetchOnce(body: string, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      text: async () => body,
    }),
  );
}

describe('yandexProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates text using the tr-text response shape', async () => {
    mockFetchOnce('{"code":200,"lang":"en-de","text":["Hallo"]}');

    const result = await yandexProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
  });

  it('joins multi-line translations', async () => {
    mockFetchOnce('{"code":200,"lang":"en-de","text":["Hallo","Welt"]}');

    const result = await yandexProvider.translate('hello\nworld', 'en', 'de');

    expect(result.translatedText).toBe('Hallo\nWelt');
  });

  it('detects the source language via the detect endpoint', async () => {
    mockFetchOnce('{"code":200,"lang":"fr"}');

    const lang = await yandexProvider.detectLanguage('bonjour');

    expect(lang).toBe('fr');
  });

  it('throws when the service returns a non-200 code', async () => {
    mockFetchOnce('{"code":413,"message":"Text too long"}');

    await expect(yandexProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Text too long/);
  });

  it('logs and throws a ProviderError when the response cannot be parsed', async () => {
    mockFetchOnce('not json');

    await expect(yandexProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Failed to parse/);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce('', false, 503);

    await expect(yandexProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 503/);
  });

  it('reports healthy when a translation comes back', async () => {
    mockFetchOnce('{"code":200,"lang":"en-de","text":["Hallo"]}');

    await expect(yandexProvider.isHealthy()).resolves.toBe(true);
  });
});
