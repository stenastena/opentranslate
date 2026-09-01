import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const curlGetMock = vi.fn();
vi.mock('./curlFetch', () => ({ curlGet: (...args: unknown[]) => curlGetMock(...args) }));

const { googleProvider, __clearGoogleRequestCacheForTests, __resetGoogleRateLimiterForTests, __setGoogleRateLimitForTests } = await import('./google');

// This suite mocks the network entirely and isn't testing the throttle's
// timing (rateLimiter.test.ts does that) — without this, every
// multi-request test (retries, fallbacks, gender pivots) would pay the
// real 300ms between each mocked call, adding real seconds to the run.
__setGoogleRateLimitForTests(0);

function mockCurlOnce(body: string, status = 200) {
  curlGetMock.mockResolvedValue({ status, body });
}

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'google', name), 'utf8');
}

describe('googleProvider', () => {
  afterEach(() => {
    curlGetMock.mockReset();
    // Without this, a later test reusing the same text/langs (to exercise a
    // different mocked response) would get back an earlier test's cached
    // response instead of ever calling the freshly mocked curlGet.
    __clearGoogleRequestCacheForTests();
    // Without this, issue #109's proactive rate limiter would make each
    // test's first network call wait out whatever's left of the cooldown
    // from the previous test's calls — real, accumulating delay for no
    // reason in a suite that mocks the network entirely.
    __resetGoogleRateLimiterForTests();
  });

  it('translates text using the dj=1 object response shape', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));

    const result = await googleProvider.translate('hello', 'en', 'de');

    expect(result.translatedText).toBe('Hallo');
    expect(result.detectedSourceLang).toBe('en');
  });

  it('joins multiple sentence segments in order', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo ' }, { trans: 'Welt' }], src: 'en' }));

    const result = await googleProvider.translate('hello world', 'en', 'de');

    expect(result.translatedText).toBe('Hallo Welt');
  });

  it('requests every dictionary dt value plus dj=1', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));

    await googleProvider.translate('hello', 'en', 'de');

    const [url] = curlGetMock.mock.calls[0];
    for (const dt of ['t', 'bd', 'ex', 'md', 'ss', 'at']) {
      expect(url).toContain(`dt=${dt}`);
    }
    // ld/qca/rw/rm are never parsed anywhere (see googleDictionary.ts) —
    // trimmed as dead request weight (#94).
    for (const dt of ['ld', 'qca', 'rw', 'rm']) {
      expect(url).not.toContain(`dt=${dt}`);
    }
    expect(url).toContain('dj=1');
  });

  it('detects the source language', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'hello' }], src: 'fr' }));

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

  describe('dual-endpoint fallback (issue #109)', () => {
    it('falls back to clients5.google.com when the primary endpoint fails, with an explicit source language', async () => {
      curlGetMock.mockResolvedValueOnce({ status: 429, body: '' }).mockResolvedValueOnce({ status: 200, body: JSON.stringify(['Hallo Welt']) });

      const result = await googleProvider.translate('hello world', 'en', 'de');

      expect(result).toEqual({ translatedText: 'Hallo Welt', usedFallback: true });
      expect(curlGetMock).toHaveBeenCalledTimes(2);
      const [fallbackUrl] = curlGetMock.mock.calls[1];
      expect(fallbackUrl).toContain('clients5.google.com/translate_a/t');
      expect(fallbackUrl).toContain('client=dict-chrome-ex');
    });

    it('parses the fallback\'s nested [text, detectedLang] shape when the source language is auto', async () => {
      curlGetMock.mockResolvedValueOnce({ status: 429, body: '' }).mockResolvedValueOnce({ status: 200, body: JSON.stringify([['Hello world', 'fr']]) });

      const result = await googleProvider.translate('bonjour le monde', 'auto', 'en');

      expect(result).toEqual({ translatedText: 'Hello world', detectedSourceLang: 'fr', usedFallback: true });
    });

    it('never has dictionary/gender data — the fallback endpoint has none to give', async () => {
      curlGetMock.mockResolvedValueOnce({ status: 429, body: '' }).mockResolvedValueOnce({ status: 200, body: JSON.stringify(['Haus']) });

      const result = await googleProvider.translate('house', 'en', 'de');

      expect(result.dictionary).toBeUndefined();
      expect(result.genderArticle).toBeUndefined();
    });

    it('does not touch the fallback endpoint at all when the primary succeeds, and does not flag usedFallback', async () => {
      // Multi-word text deliberately, so this isn't also exercising the
      // unrelated gender-pivot lookup (#76) — this test is only about the
      // fallback endpoint staying untouched on a primary success.
      mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo Welt' }], src: 'en' }));

      const result = await googleProvider.translate('hello world', 'en', 'de');

      expect(curlGetMock).toHaveBeenCalledTimes(1);
      expect(result.usedFallback).toBeUndefined();
    });

    it('throws the primary error (not the fallback error) when both endpoints fail', async () => {
      curlGetMock.mockResolvedValueOnce({ status: 503, body: '' }).mockResolvedValueOnce({ status: 429, body: '' });

      await expect(googleProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 503/);
    });
  });

  it('reports healthy when a translation comes back', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));

    await expect(googleProvider.isHealthy()).resolves.toBe(true);
  });

  it('has no part-of-speech dictionary entries for a translated phrase (real fixture)', async () => {
    mockCurlOnce(loadFixture('phrase-en-de.json'));

    const result = await googleProvider.translate('hello world, how are you', 'en', 'de');

    expect(result.translatedText).toBe('Hallo Welt, wie geht es dir?');
    expect(result.dictionary?.entries).toEqual([]);
  });

  it('includes dictionary data for a single-word lookup (real fixture)', async () => {
    mockCurlOnce(loadFixture('run-en-de.json'));

    const result = await googleProvider.translate('run', 'en', 'de');

    expect(result.dictionary).toBeDefined();
    expect(result.dictionary!.entries.some((e) => e.partOfSpeech === 'verb')).toBe(true);
  });

  it('finds the gender article directly when the translated word matches a dict entry (real fixture)', async () => {
    // "house" -> "maison" (fr): the sentence-level translation happens to
    // match the dict's own top noun candidate exactly, so this exercises
    // the free/no-extra-request path, not the pivot fallback.
    mockCurlOnce(loadFixture('house-en-fr.json'));

    const result = await googleProvider.translate('house', 'en', 'fr');

    expect(result.translatedText).toBe('maison');
    expect(result.genderArticle).toBe('la');
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a pivot lookup when the translated word is absent from the direct dict response (real fixtures)', async () => {
    // Translating "Бизнес" (ru) gives the sentence-level translation
    // "Geschäft", but the dict's own top noun candidate for that query is
    // "Business" — findArticleForWord finds nothing directly, so this
    // exercises the two-hop pivot: gloss "Geschäft" to English ("Business"),
    // then look up *that* word's German dict entry and find "Geschäft"
    // listed there with its article.
    curlGetMock
      .mockResolvedValueOnce({ status: 200, body: loadFixture('biznes-ru-de.json') })
      .mockResolvedValueOnce({ status: 200, body: loadFixture('geschaeft-gloss-de-en.json') })
      .mockResolvedValueOnce({ status: 200, body: loadFixture('business-en-de.json') });

    const result = await googleProvider.translate('Бизнес', 'ru', 'de');

    expect(result.translatedText).toBe('Geschäft');
    expect(result.genderArticle).toBe('das');
    expect(curlGetMock).toHaveBeenCalledTimes(3);
  });

  it("computes the source word's own gender article via the same pivot, independent of the target language", async () => {
    // German source, Russian target — Russian has no articles of its own
    // (genderArticle stays undefined), but the source word "Einschränkung"
    // is still German, so sourceGenderArticle should be found via the same
    // word->English-gloss->dict-lookup-back pivot findTranslationGender
    // already uses for the target-word case.
    curlGetMock
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ sentences: [{ trans: 'ограничение' }], src: 'de' }) })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ sentences: [{ trans: 'restriction' }] }) })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ dict: [{ pos: 'noun', entry: [{ word: 'Einschränkung', previous_word: 'die' }] }] }) });

    const result = await googleProvider.translate('Einschränkung', 'de', 'ru');

    expect(result.translatedText).toBe('ограничение');
    expect(result.genderArticle).toBeUndefined();
    expect(result.sourceGenderArticle).toBe('die');
    expect(curlGetMock).toHaveBeenCalledTimes(3);
    const glossUrl = curlGetMock.mock.calls[1][0];
    expect(glossUrl).toContain('sl=de');
    expect(glossUrl).toContain('tl=en');
    const dictUrl = curlGetMock.mock.calls[2][0];
    expect(dictUrl).toContain('sl=en');
    expect(dictUrl).toContain('tl=de');
  });

  it('does not compute a source gender article when the source language has no articles', async () => {
    mockCurlOnce(loadFixture('house-en-fr.json'));

    const result = await googleProvider.translate('house', 'en', 'fr');

    expect(result.sourceGenderArticle).toBeUndefined();
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a gender lookup for non-article target languages or multi-word translations', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'привет' }], src: 'en' }));
    await googleProvider.translate('hello', 'en', 'ru');
    expect(curlGetMock).toHaveBeenCalledTimes(1);

    curlGetMock.mockReset();
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'guten Tag' }], src: 'en' }));
    await googleProvider.translate('good day', 'en', 'de');
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a gender lookup for detectLanguage or isHealthy calls', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));
    await googleProvider.isHealthy();
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('a lightweight call requests only dt=t and skips the gender lookup entirely', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Geschäft' }], src: 'ru' }));

    const result = await googleProvider.translate('Бизнес', 'ru', 'de', { lightweight: true });

    expect(result.translatedText).toBe('Geschäft');
    expect(result.dictionary).toBeUndefined();
    expect(result.genderArticle).toBeUndefined();
    expect(result.sourceGenderArticle).toBeUndefined();
    expect(curlGetMock).toHaveBeenCalledTimes(1);
    const [url] = curlGetMock.mock.calls[0];
    expect(url).toContain('dt=t');
    expect(url).not.toContain('dt=bd');
  });

  it('serves a repeated identical request from cache instead of hitting the network again (#94)', async () => {
    // Target 'ru' deliberately, not an article language — this isolates
    // the plain request-cache behavior from the separate pivot-lookup
    // mechanism (also cached, see the next test) so this one has an
    // unambiguous "exactly 1 network call total" expectation.
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'привет' }], src: 'en' }));

    const first = await googleProvider.translate('hello', 'en', 'ru');
    const second = await googleProvider.translate('hello', 'en', 'ru');

    expect(first).toEqual(second);
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('caches the gender-pivot fallback too, so re-translating the same word only pays its 3-request cost once (#94)', async () => {
    curlGetMock
      .mockResolvedValueOnce({ status: 200, body: loadFixture('biznes-ru-de.json') })
      .mockResolvedValueOnce({ status: 200, body: loadFixture('geschaeft-gloss-de-en.json') })
      .mockResolvedValueOnce({ status: 200, body: loadFixture('business-en-de.json') });

    const first = await googleProvider.translate('Бизнес', 'ru', 'de');
    expect(curlGetMock).toHaveBeenCalledTimes(3);

    const second = await googleProvider.translate('Бизнес', 'ru', 'de');
    expect(second).toEqual(first);
    expect(curlGetMock).toHaveBeenCalledTimes(3); // no additional calls for the repeat
  });

  it('does not cache a non-200 response, so a repeat of the same request hits the network again (#94)', async () => {
    mockCurlOnce('', 429);

    await expect(googleProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 429/);
    await expect(googleProvider.translate('hello', 'en', 'de')).rejects.toThrow(/status 429/);

    // 2 calls per translate() attempt since #109: the primary endpoint,
    // then the dual-endpoint fallback (also mocked to 429 here, since
    // mockCurlOnce uses mockResolvedValue — every curlGet call gets the
    // same failing response, primary and fallback alike).
    expect(curlGetMock).toHaveBeenCalledTimes(4);
  });

  it('caches a differently-parameterized request (different lightweight flag) separately from the full one (#94)', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));
    await googleProvider.translate('hello', 'en', 'de');

    curlGetMock.mockReset();
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'Hallo' }], src: 'en' }));
    const lightweight = await googleProvider.translate('hello', 'en', 'de', { lightweight: true });

    expect(lightweight.dictionary).toBeUndefined();
    expect(curlGetMock).toHaveBeenCalledTimes(1);
  });

  it('skipCache bypasses a cached entry and hits the network again (#98)', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'привет' }], src: 'en' }));
    await googleProvider.translate('hello', 'en', 'ru');
    expect(curlGetMock).toHaveBeenCalledTimes(1);

    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'привет' }], src: 'en' }));
    await googleProvider.translate('hello', 'en', 'ru', { skipCache: true });

    expect(curlGetMock).toHaveBeenCalledTimes(2);
  });

  it('skipCache still writes the fresh response back to the cache for subsequent normal (non-skipCache) calls (#98)', async () => {
    mockCurlOnce(JSON.stringify({ sentences: [{ trans: 'привет' }], src: 'en' }));
    await googleProvider.translate('hello', 'en', 'ru', { skipCache: true });
    expect(curlGetMock).toHaveBeenCalledTimes(1);

    await googleProvider.translate('hello', 'en', 'ru');

    expect(curlGetMock).toHaveBeenCalledTimes(1); // second call served from the cache the first (skipCache) call populated
  });
});
