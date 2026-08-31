import { beforeEach, describe, expect, it, vi } from 'vitest';

const curlGetMock = vi.fn();
const curlPostFormBytesMock = vi.fn();
vi.mock('../providers/curlFetch', () => ({
  curlGet: (...args: unknown[]) => curlGetMock(...args),
  curlPostFormBytes: (...args: unknown[]) => curlPostFormBytesMock(...args),
}));

const { __resetBingAuthCacheForTests } = await import('../providers/bingAuth');
const { bingCloudTtsProvider } = await import('./bingCloudProvider');

// A trimmed-down stand-in for www.bing.com/translator's real markup —
// just the four fragments fetchAuth's regexes actually extract, in the
// same shapes confirmed live against the real page (2026-08-31).
const TRANSLATOR_HTML = `
  <script>
    var IG:"ABC123";
    var params_AbusePreventionHelper = [1700000000000,"tok123",3600000];
    var other = {"muid":"MUID123","sid":"whatever"};
  </script>
  <div data-iid="translator.5023"></div>
`;

function authPageResponse(html = TRANSLATOR_HTML) {
  return { status: 200, body: html };
}

describe('bingCloudTtsProvider', () => {
  beforeEach(() => {
    curlGetMock.mockReset();
    curlPostFormBytesMock.mockReset();
    __resetBingAuthCacheForTests();
  });

  it('fetches auth from the translator page, then POSTs SSML with the extracted tokens', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    const result = await bingCloudTtsProvider.speak('Hallo Welt', 'de');

    expect(result).toEqual({ kind: 'audio', data: Buffer.from('audio'), mimeType: 'audio/mpeg' });
    expect(curlGetMock).toHaveBeenCalledWith('https://www.bing.com/translator', expect.any(Object));

    const [url, queryParams, formData, , cookieHeader] = curlPostFormBytesMock.mock.calls[0];
    expect(url).toBe('https://www.bing.com/tfettts');
    expect(queryParams).toEqual({ isVertical: '1', IG: 'ABC123', IID: 'translator.5023' });
    expect(formData.token).toBe('tok123');
    expect(formData.key).toBe('1700000000000');
    expect(formData.ssml).toContain('de-DE-KatjaNeural');
    expect(formData.ssml).toContain('Hallo Welt');
    expect(cookieHeader).toBe('MUID=MUID123');
  });

  it('escapes SSML-unsafe characters in the captured text', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    await bingCloudTtsProvider.speak(`<tag> & "quoted" 'text'`, 'en');

    const [, , formData] = curlPostFormBytesMock.mock.calls[0];
    expect(formData.ssml).not.toContain('<tag>');
    expect(formData.ssml).toContain('&lt;tag&gt;');
    expect(formData.ssml).toContain('&amp;');
    expect(formData.ssml).toContain('&quot;quoted&quot;');
    expect(formData.ssml).toContain('&apos;text&apos;');
  });

  it('reuses cached auth across multiple speak() calls', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    await bingCloudTtsProvider.speak('one', 'en');
    await bingCloudTtsProvider.speak('two', 'en');

    expect(curlGetMock).toHaveBeenCalledTimes(1);
    expect(curlPostFormBytesMock).toHaveBeenCalledTimes(2);
  });

  it('retries once with a freshly-fetched auth token when the request fails', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValueOnce({ status: 400, body: Buffer.alloc(0) }).mockResolvedValueOnce({ status: 200, body: Buffer.from('audio') });

    const result = await bingCloudTtsProvider.speak('hello', 'en');

    expect(result).toEqual({ kind: 'audio', data: Buffer.from('audio'), mimeType: 'audio/mpeg' });
    expect(curlGetMock).toHaveBeenCalledTimes(2); // initial auth fetch + forced refresh
    expect(curlPostFormBytesMock).toHaveBeenCalledTimes(2);
  });

  it('throws when both the initial attempt and the forced-refresh retry fail', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 500, body: Buffer.alloc(0) });

    await expect(bingCloudTtsProvider.speak('hello', 'en')).rejects.toThrow();
  });

  it('throws a clear error when the translator page markup cannot be parsed', async () => {
    curlGetMock.mockResolvedValue({ status: 200, body: '<html>no tokens here</html>' });

    await expect(bingCloudTtsProvider.speak('hello', 'en')).rejects.toThrow(/Failed to extract Bing auth tokens/);
  });

  it('returns empty audio for blank text without making any request', async () => {
    const result = await bingCloudTtsProvider.speak('   ', 'en');

    expect(result).toEqual({ kind: 'audio', data: Buffer.alloc(0), mimeType: 'audio/mpeg' });
    expect(curlGetMock).not.toHaveBeenCalled();
    expect(curlPostFormBytesMock).not.toHaveBeenCalled();
  });

  it('falls back to the English voice for a language with no table entry', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    await bingCloudTtsProvider.speak('hello', 'xx');

    const [, , formData] = curlPostFormBytesMock.mock.calls[0];
    expect(formData.ssml).toContain('en-US-AriaNeural');
  });

  it('an explicit voiceName overrides language-based selection', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    await bingCloudTtsProvider.speak('hello', 'en', 'de-DE-KatjaNeural');

    const [, , formData] = curlPostFormBytesMock.mock.calls[0];
    expect(formData.ssml).toContain('de-DE-KatjaNeural');
  });

  it('isHealthy returns true after a successful synthesis', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio') });

    await expect(bingCloudTtsProvider.isHealthy()).resolves.toBe(true);
  });

  it('isHealthy returns false when synthesis fails entirely', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());
    curlPostFormBytesMock.mockResolvedValue({ status: 500, body: Buffer.alloc(0) });

    await expect(bingCloudTtsProvider.isHealthy()).resolves.toBe(false);
  });

  it('listVoices returns the fixed per-language voice table without any network call', async () => {
    const voices = await bingCloudTtsProvider.listVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices.find((v) => v.langCode === 'de')).toEqual({
      name: 'de-DE-KatjaNeural',
      locale: 'de-DE',
      langCode: 'de',
      description: 'de-DE-KatjaNeural (Female)',
    });
    expect(curlGetMock).not.toHaveBeenCalled();
    expect(curlPostFormBytesMock).not.toHaveBeenCalled();
  });
});
