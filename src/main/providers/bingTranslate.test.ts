import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBingAuthMock = vi.fn();
const curlPostFormMock = vi.fn();
vi.mock('./bingAuth', () => ({
  getBingAuth: (...args: unknown[]) => getBingAuthMock(...args),
}));
vi.mock('./curlFetch', () => ({
  curlPostForm: (...args: unknown[]) => curlPostFormMock(...args),
}));

const { bingProvider } = await import('./bingTranslate');

const FAKE_AUTH = { ig: 'IG1', iid: 'IID1', key: 'KEY1', token: 'TOKEN1', muid: 'MUID1' };

function bingResponse(text: string, to: string, detected: string) {
  return { status: 200, body: JSON.stringify([{ translations: [{ text, to }], detectedLanguage: { language: detected } }]) };
}

describe('bingProvider', () => {
  beforeEach(() => {
    getBingAuthMock.mockReset();
    curlPostFormMock.mockReset();
    getBingAuthMock.mockResolvedValue(FAKE_AUTH);
  });

  it('translates and maps the returned language code back to this app\'s bare codes', async () => {
    curlPostFormMock.mockResolvedValue(bingResponse('Hallo', 'de', 'en'));

    const result = await bingProvider.translate('hello', 'en', 'de');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
    const [url, queryParams, formData] = curlPostFormMock.mock.calls[0];
    expect(url).toBe('https://www.bing.com/ttranslatev3');
    expect(queryParams).toEqual({ isVertical: '1', IG: 'IG1', IID: 'IID1' });
    expect(formData).toMatchObject({ text: 'hello', fromLang: 'en', to: 'de', token: 'TOKEN1', key: 'KEY1', isAuthv2: 'true' });
  });

  it('maps this app\'s "auto" source to Bing\'s "auto-detect" sentinel', async () => {
    curlPostFormMock.mockResolvedValue(bingResponse('Hallo', 'de', 'en'));

    await bingProvider.translate('hello', 'auto', 'de');

    const [, , formData] = curlPostFormMock.mock.calls[0];
    expect(formData.fromLang).toBe('auto-detect');
  });

  it('maps this app\'s bare "zh" to Bing\'s "zh-Hans" and back on the response', async () => {
    curlPostFormMock.mockResolvedValue({ status: 200, body: JSON.stringify([{ translations: [{ text: '你好', to: 'zh-Hans' }], detectedLanguage: { language: 'zh-Hans' } }]) });

    const result = await bingProvider.translate('hello', 'en', 'zh');

    expect(result).toEqual({ translatedText: '你好', detectedSourceLang: 'zh' });
    const [, , formData] = curlPostFormMock.mock.calls[0];
    expect(formData.to).toBe('zh-Hans');
  });

  it('joins multiple translation segments with no separator, matching Bing\'s own client', async () => {
    curlPostFormMock.mockResolvedValue({
      status: 200,
      body: JSON.stringify([{ translations: [{ text: 'Hallo', to: 'de' }, { text: ' Welt', to: 'de' }], detectedLanguage: { language: 'en' } }]),
    });

    const result = await bingProvider.translate('hello world', 'en', 'de');

    expect(result.translatedText).toBe('Hallo Welt');
  });

  it('detectLanguage returns the detected source language', async () => {
    curlPostFormMock.mockResolvedValue(bingResponse('hello', 'en', 'ru'));

    await expect(bingProvider.detectLanguage('привет')).resolves.toBe('ru');
    const [, , formData] = curlPostFormMock.mock.calls[0];
    expect(formData.fromLang).toBe('auto-detect');
    expect(formData.to).toBe('en');
  });

  it('isHealthy reflects a successful translation', async () => {
    curlPostFormMock.mockResolvedValue(bingResponse('Hallo', 'de', 'en'));

    await expect(bingProvider.isHealthy()).resolves.toBe(true);
  });

  it('retries once with a freshly-fetched auth token when the request fails, then succeeds', async () => {
    curlPostFormMock.mockResolvedValueOnce({ status: 401, body: '{"ShowCaptcha":false}' }).mockResolvedValueOnce(bingResponse('Hallo', 'de', 'en'));

    // lightweight: true — this test is about the translate-call retry
    // behavior specifically; without it, a third (dictionary-lookup) call
    // would also fire for this single-word text (see the "dictionary
    // lookup" describe block below) and throw off the call-count assertions.
    const result = await bingProvider.translate('hello', 'en', 'de', { lightweight: true });

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLang: 'en' });
    expect(getBingAuthMock).toHaveBeenCalledTimes(2);
    expect(getBingAuthMock).toHaveBeenNthCalledWith(1, false);
    expect(getBingAuthMock).toHaveBeenNthCalledWith(2, true);
  });

  it('throws when both the initial attempt and the forced-refresh retry fail with a non-200 status', async () => {
    curlPostFormMock.mockResolvedValue({ status: 500, body: '' });

    await expect(bingProvider.translate('hello', 'en', 'de')).rejects.toThrow('status 500');
  });

  it('throws a clear error when the response body has neither translations nor detectedLanguage (e.g. an unsupported language)', async () => {
    curlPostFormMock.mockResolvedValue({ status: 200, body: '{"statusCode":400,"errorMessage":""}' });

    await expect(bingProvider.translate('hello', 'en', 'xx')).rejects.toThrow('Unexpected Bing Translate response');
  });

  it('throws a ProviderError when the response body is not valid JSON', async () => {
    curlPostFormMock.mockResolvedValue({ status: 200, body: 'not json' });

    await expect(bingProvider.translate('hello', 'en', 'de')).rejects.toThrow('Failed to parse Bing Translate response');
  });

  it('omits the Cookie header when auth has no muid', async () => {
    getBingAuthMock.mockResolvedValue({ ...FAKE_AUTH, muid: '' });
    curlPostFormMock.mockResolvedValue(bingResponse('Hallo', 'de', 'en'));

    await bingProvider.translate('hello', 'en', 'de');

    const [, , , , cookieHeader] = curlPostFormMock.mock.calls[0];
    expect(cookieHeader).toBe('');
  });

  describe('dictionary lookup (issue #119)', () => {
    function lookupResponse(entries: unknown[]) {
      return { status: 200, body: JSON.stringify(entries) };
    }

    it('fetches tlookupv3 after a single-word translation and attaches the parsed dictionary', async () => {
      curlPostFormMock
        .mockResolvedValueOnce(bingResponse('Haus', 'de', 'en'))
        .mockResolvedValueOnce(lookupResponse([{ normalizedSource: 'house', displaySource: 'house', translations: [{ normalizedTarget: 'haus', displayTarget: 'haus', posTag: 'NOUN', confidence: 1, prefixWord: '', backTranslations: [] }] }]));

      const result = await bingProvider.translate('house', 'en', 'de');

      expect(result.translatedText).toBe('Haus');
      expect(result.dictionary?.entries[0].partOfSpeech).toBe('noun');
      expect(curlPostFormMock).toHaveBeenCalledTimes(2);
      const [url, queryParams, formData] = curlPostFormMock.mock.calls[1];
      expect(url).toBe('https://www.bing.com/tlookupv3');
      expect(queryParams).toEqual({ isVertical: '1', IG: 'IG1', IID: 'IID1' });
      expect(formData).toMatchObject({ from: 'en', to: 'de', text: 'house', translatedtext: 'Haus', token: 'TOKEN1', key: 'KEY1' });
    });

    it('sets genderArticle when the lookup response carries a prefixWord', async () => {
      curlPostFormMock
        .mockResolvedValueOnce(bingResponse('Einschränkung', 'de', 'en'))
        .mockResolvedValueOnce(lookupResponse([{ normalizedSource: 'restriction', displaySource: 'restriction', translations: [{ normalizedTarget: 'einschränkung', displayTarget: 'Einschränkung', posTag: 'NOUN', confidence: 1, prefixWord: 'die', backTranslations: [] }] }]));

      const result = await bingProvider.translate('restriction', 'en', 'de');

      expect(result.genderArticle).toBe('die');
    });

    it('does not fetch the dictionary for multi-word text', async () => {
      curlPostFormMock.mockResolvedValueOnce(bingResponse('Hallo Welt', 'de', 'en'));

      const result = await bingProvider.translate('hello world', 'en', 'de');

      expect(result.dictionary).toBeUndefined();
      expect(curlPostFormMock).toHaveBeenCalledTimes(1);
    });

    it('does not fetch the dictionary for a lightweight call', async () => {
      curlPostFormMock.mockResolvedValueOnce(bingResponse('Haus', 'de', 'en'));

      const result = await bingProvider.translate('house', 'en', 'de', { lightweight: true });

      expect(result.dictionary).toBeUndefined();
      expect(curlPostFormMock).toHaveBeenCalledTimes(1);
    });

    it('does not fetch the dictionary for detectLanguage or isHealthy calls', async () => {
      curlPostFormMock.mockResolvedValueOnce(bingResponse('Hallo', 'de', 'en'));
      await bingProvider.isHealthy();
      expect(curlPostFormMock).toHaveBeenCalledTimes(1);

      curlPostFormMock.mockReset();
      curlPostFormMock.mockResolvedValueOnce(bingResponse('hello', 'en', 'ru'));
      await bingProvider.detectLanguage('привет');
      expect(curlPostFormMock).toHaveBeenCalledTimes(1);
    });

    it('leaves dictionary/genderArticle unset (not a thrown error) when the lookup request itself fails', async () => {
      curlPostFormMock.mockResolvedValueOnce(bingResponse('Haus', 'de', 'en')).mockResolvedValueOnce({ status: 500, body: '' });

      const result = await bingProvider.translate('house', 'en', 'de');

      expect(result.translatedText).toBe('Haus');
      expect(result.dictionary).toBeUndefined();
      expect(result.genderArticle).toBeUndefined();
    });

    it('leaves dictionary/genderArticle unset when the lookup response is not valid JSON', async () => {
      curlPostFormMock.mockResolvedValueOnce(bingResponse('Haus', 'de', 'en')).mockResolvedValueOnce({ status: 200, body: 'not json' });

      const result = await bingProvider.translate('house', 'en', 'de');

      expect(result.translatedText).toBe('Haus');
      expect(result.dictionary).toBeUndefined();
    });
  });
});
