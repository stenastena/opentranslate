import { afterEach, describe, expect, it, vi } from 'vitest';
import { deeplProvider } from './deepl';

function mockFetchOnce(body: string, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('deeplProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates text using the jsonrpc response shape', async () => {
    mockFetchOnce(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { texts: [{ text: 'Hallo' }], lang: 'EN' } }),
    );

    const result = await deeplProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
  });

  it('sends a POST request with a JSON body targeting LMT_handle_texts', async () => {
    const fetchMock = mockFetchOnce(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { texts: [{ text: 'Hallo' }], lang: 'EN' } }),
    );

    await deeplProvider.translate('hello', 'en', 'de');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('LMT_handle_texts');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('LMT_handle_texts');
    expect(init.body).toContain('"target_lang":"DE"');
  });

  it('detects the source language', async () => {
    mockFetchOnce(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { texts: [{ text: 'hello' }], lang: 'FR' } }),
    );

    const lang = await deeplProvider.detectLanguage('bonjour');

    expect(lang).toBe('fr');
  });

  it('throws with the service message when DeepL returns a jsonrpc error', async () => {
    mockFetchOnce(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 1042911, message: 'Too many requests' } }));

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Too many requests/);
  });

  it('logs and throws a ProviderError when the response cannot be parsed', async () => {
    mockFetchOnce('not json');

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Failed to parse/);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce('', false, 503);

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 503/);
  });

  it('reports healthy when a translation comes back', async () => {
    mockFetchOnce(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { texts: [{ text: 'Hallo' }], lang: 'EN' } }),
    );

    await expect(deeplProvider.isHealthy()).resolves.toBe(true);
  });
});
