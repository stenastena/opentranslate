import { afterEach, describe, expect, it, vi } from 'vitest';
import { myMemoryProvider } from './mymemory';

function mockFetchOnce(rawBody: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => JSON.parse(rawBody),
      text: async () => rawBody,
    }),
  );
}

describe('myMemoryProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates text using the responseData shape', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"Hallo"},"responseStatus":200}');

    const result = await myMemoryProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: undefined });
  });

  it('sends a langpair query param built from source and target', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ responseData: { translatedText: 'Hallo' }, responseStatus: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await myMemoryProvider.translate('hello', 'en', 'de');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('langpair=en%7Cde');
    expect(url).toContain('q=hello');
  });

  it('maps this app\'s "auto" source to MyMemory\'s "autodetect" sentinel and reads detectedLanguage back', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"Hi","detectedLanguage":"ru"},"responseStatus":200}');

    const result = await myMemoryProvider.translate('привет', 'auto', 'en');

    expect(result).toEqual({ translatedText: 'Hi', detectedSourceLang: 'ru' });
  });

  it('detectLanguage returns the detected source language', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"hi","detectedLanguage":"fr"},"responseStatus":200}');

    await expect(myMemoryProvider.detectLanguage('bonjour')).resolves.toBe('fr');
  });

  it('detectLanguage throws when no detectedLanguage comes back', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"hi"},"responseStatus":200}');

    await expect(myMemoryProvider.detectLanguage('bonjour')).rejects.toThrow('did not return a detected source language');
  });

  it('throws with the service message when responseStatus is a non-200 string (confirmed live shape)', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"NO QUERY SPECIFIED..."},"responseStatus":"403","responseDetails":"NO QUERY SPECIFIED. EXAMPLE REQUEST: GET?Q=HELLO&LANGPAIR=EN|IT"}');

    await expect(myMemoryProvider.translate('', 'en', 'de')).rejects.toThrow('NO QUERY SPECIFIED');
  });

  it('rejects text over 500 characters before making any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const longText = 'a'.repeat(501);

    await expect(myMemoryProvider.translate(longText, 'en', 'de')).rejects.toThrow(/too long/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs and throws a ProviderError when the response cannot be parsed', async () => {
    mockFetchOnce('not json');

    await expect(myMemoryProvider.translate('hello', 'en', 'de')).rejects.toThrow('Failed to parse MyMemory response');
  });

  it('reports healthy when a translation comes back', async () => {
    mockFetchOnce('{"responseData":{"translatedText":"Hallo"},"responseStatus":200}');

    await expect(myMemoryProvider.isHealthy()).resolves.toBe(true);
  });
});
