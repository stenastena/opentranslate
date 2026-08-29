import { afterEach, describe, expect, it, vi } from 'vitest';

const curlGetMock = vi.fn();
vi.mock('./curlFetch', () => ({ curlGet: (...args: unknown[]) => curlGetMock(...args) }));

const { googleProvider } = await import('./google');

function mockCurlOnce(body: string, status = 200) {
  curlGetMock.mockResolvedValue({ status, body });
}

describe('googleProvider', () => {
  afterEach(() => {
    curlGetMock.mockReset();
  });

  it('translates text using the unofficial gtx endpoint response shape', async () => {
    mockCurlOnce('[[["Hallo","hello",null,null,3]],null,"en"]');

    const result = await googleProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
  });

  it('joins multiple segments in order', async () => {
    mockCurlOnce('[[["Hallo ","hello ",null,null,1],["Welt","world",null,null,1]],null,"en"]');

    const result = await googleProvider.translate('hello world', 'en', 'de');

    expect(result.translatedText).toBe('Hallo Welt');
  });

  it('detects the source language', async () => {
    mockCurlOnce('[[["hello","bonjour",null,null,3]],null,"fr"]');

    const lang = await googleProvider.detectLanguage('bonjour');

    expect(lang).toBe('fr');
  });

  it('logs the raw response and throws a ProviderError when the response cannot be parsed', async () => {
    mockCurlOnce('not json');

    await expect(googleProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Failed to parse/);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockCurlOnce('', 503);

    await expect(googleProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 503/);
  });

  it('reports healthy when a translation comes back', async () => {
    mockCurlOnce('[[["Hallo","hello",null,null,3]],null,"en"]');

    await expect(googleProvider.isHealthy()).resolves.toBe(true);
  });
});
