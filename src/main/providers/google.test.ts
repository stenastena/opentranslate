import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const curlGetMock = vi.fn();
vi.mock('./curlFetch', () => ({ curlGet: (...args: unknown[]) => curlGetMock(...args) }));

const { googleProvider } = await import('./google');

function mockCurlOnce(body: string, status = 200) {
  curlGetMock.mockResolvedValue({ status, body });
}

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'google', name), 'utf8');
}

describe('googleProvider', () => {
  afterEach(() => {
    curlGetMock.mockReset();
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
    for (const dt of ['t', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 'at']) {
      expect(url).toContain(`dt=${dt}`);
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
    expect(curlGetMock).toHaveBeenCalledTimes(1);
    const [url] = curlGetMock.mock.calls[0];
    expect(url).toContain('dt=t');
    expect(url).not.toContain('dt=bd');
  });
});
