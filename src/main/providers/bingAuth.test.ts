import { beforeEach, describe, expect, it, vi } from 'vitest';

const curlGetMock = vi.fn();
vi.mock('./curlFetch', () => ({
  curlGet: (...args: unknown[]) => curlGetMock(...args),
}));

const { __resetBingAuthCacheForTests, getBingAuth } = await import('./bingAuth');

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

describe('getBingAuth', () => {
  beforeEach(() => {
    curlGetMock.mockReset();
    __resetBingAuthCacheForTests();
  });

  it('scrapes IG/IID/key/token/muid from the translator page', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());

    const auth = await getBingAuth(false);

    expect(auth).toEqual({ ig: 'ABC123', iid: 'translator.5023', key: '1700000000000', token: 'tok123', muid: 'MUID123' });
    expect(curlGetMock).toHaveBeenCalledWith('https://www.bing.com/translator', expect.any(Object));
  });

  it('caches the result across calls until forceRefresh is passed', async () => {
    curlGetMock.mockResolvedValue(authPageResponse());

    await getBingAuth(false);
    await getBingAuth(false);
    expect(curlGetMock).toHaveBeenCalledTimes(1);

    await getBingAuth(true);
    expect(curlGetMock).toHaveBeenCalledTimes(2);
  });

  it('defaults muid to an empty string when the page has none', async () => {
    const html = TRANSLATOR_HTML.replace('"muid":"MUID123",', '');
    curlGetMock.mockResolvedValue(authPageResponse(html));

    const auth = await getBingAuth(false);

    expect(auth.muid).toBe('');
  });

  it('throws when the translator page request fails', async () => {
    curlGetMock.mockResolvedValue({ status: 503, body: '' });

    await expect(getBingAuth(false)).rejects.toThrow('Failed to load Bing translator page');
  });

  it('throws a clear error when the page markup cannot be parsed', async () => {
    curlGetMock.mockResolvedValue(authPageResponse('<html>no tokens here</html>'));

    await expect(getBingAuth(false)).rejects.toThrow(/Failed to extract Bing auth tokens/);
  });

  it('throws when the abuse-prevention helper array is not valid JSON', async () => {
    const html = TRANSLATOR_HTML.replace('[1700000000000,"tok123",3600000]', '[not valid json]');
    curlGetMock.mockResolvedValue(authPageResponse(html));

    await expect(getBingAuth(false)).rejects.toThrow(/Failed to parse Bing abuse-prevention helper data/);
  });
});
