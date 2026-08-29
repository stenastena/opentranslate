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

  it('translates text using the oneshot response shape', async () => {
    mockFetchOnce(JSON.stringify({ translations: [{ text: 'Hallo', detected_source_language: 'EN' }] }));

    const result = await deeplProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
  });

  it('sends a POST request to the oneshot endpoint with the expected body', async () => {
    const fetchMock = mockFetchOnce(JSON.stringify({ translations: [{ text: 'Hallo' }] }));

    await deeplProvider.translate('hello', 'en', 'de');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('oneshot-free.www.deepl.com/v1/translate');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('None');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ text: ['hello'], target_lang: 'de', source_lang: 'en', usage_type: 'translate' });
  });

  it('normalizes bare "en"/"pt"/"zh" target codes to DeepL\'s regional/script variants', async () => {
    const fetchMock = mockFetchOnce(JSON.stringify({ translations: [{ text: 'hi' }] }));

    await deeplProvider.translate('hallo', 'de', 'en');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.target_lang).toBe('en-US');
  });

  it('omits source_lang when auto-detecting', async () => {
    mockFetchOnce(JSON.stringify({ translations: [{ text: 'hello', detected_source_language: 'FR' }] }));

    const lang = await deeplProvider.detectLanguage('bonjour');

    expect(lang).toBe('fr');
  });

  it('throws with the service message when DeepL returns a non-ok response with a message', async () => {
    mockFetchOnce(JSON.stringify({ message: 'Too many requests' }), false, 429);

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Too many requests/);
  });

  it('logs and throws a ProviderError when the response cannot be parsed', async () => {
    mockFetchOnce('not json');

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/Failed to parse/);
  });

  it('throws with the status code when the HTTP response is not ok and has no message', async () => {
    mockFetchOnce('', false, 503);

    await expect(deeplProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 503/);
  });

  it('reports healthy when a translation comes back', async () => {
    mockFetchOnce(JSON.stringify({ translations: [{ text: 'Hallo' }] }));

    await expect(deeplProvider.isHealthy()).resolves.toBe(true);
  });
});
