import { CHROME_USER_AGENT } from './browserHeaders';
import { CurlResponse, curlGet } from './curlFetch';
import { findArticleForWord, parseGoogleDictionary, RawGoogleFullResponse } from './googleDictionary';
import { logProviderParseError } from './logger';
import { createRateLimiter } from './rateLimiter';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
// Issue #109: a second, independent unofficial endpoint — Google's
// `dict-chrome-ex` browser-extension client, ported from ahatem/
// QTranslate's own Google plugin, confirmed live (2026-09-01) that it
// still works and is a genuinely separate service from ENDPOINT above
// (translate.googleapis.com vs. clients5.google.com). Only ever tried
// when the primary request fails — see fetchGoogleFallback. Its response
// has no dictionary/gender data at all, just the bare translation, so a
// result built from it never gets genderArticle/sourceGenderArticle —
// degraded-but-working beats a hard error during a primary-endpoint
// outage.
const FALLBACK_ENDPOINT = 'https://clients5.google.com/translate_a/t';
const HEALTH_CHECK_TEXT = 'hello';

// Issue #109: proactive self-throttling, a light one — this endpoint
// already has #94's retry-after-429 and 5-minute response cache, so this
// is just extra insurance against a rapid-fire *burst* of new (cache-miss)
// lookups, e.g. clicking through several different words quickly. Not a
// value taken from QTranslate (their Google plugin doesn't throttle
// proactively at all) — a conservative engineering judgment call given
// #94's own finding that this endpoint is unusually easy to rate-limit.
const rateLimiter = createRateLimiter(300);

export function __resetGoogleRateLimiterForTests(): void {
  rateLimiter.__resetForTests();
}

// A test suite exercising a multi-request case (retry, fallback, gender
// pivot) would otherwise pay the real 300ms between each mocked call —
// real seconds added to a suite where the network is entirely faked and
// nothing is actually testing the throttle's timing itself (that's
// rateLimiter.test.ts's job).
export function __setGoogleRateLimitForTests(ms: number): void {
  rateLimiter.__setIntervalForTests(ms);
}

// Target languages where Google's dict data attaches a definite article to
// noun entries (confirmed for de/fr; the rest are the other common
// article-using languages this endpoint is expected to behave the same
// way for — see findArticleForWord). Gated so the extra pivot lookup in
// findTranslationGender never fires for languages that could never have
// an article anyway (e.g. Russian, Chinese).
const ARTICLE_LANGUAGES = new Set(['de', 'fr', 'es', 'it', 'pt', 'nl']);

// Issue #94: this endpoint's rate limit is easy to hit even under light,
// real-world use — a single article-language word lookup can already cost
// up to 3 requests (the main call plus findTranslationGender's two-hop
// pivot below), and re-viewing the same word (switching tabs back and
// forth, re-selecting the same text) previously always re-hit the network
// for an identical answer. Caching by the exact request URL (which already
// fully encodes text/langs/dt-params) dedupes that for free. Only
// successful (200) responses are cached — a 429/error must hit the network
// again next time rather than get "stuck" as a cached failure.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const requestCache = new Map<string, CurlResponse>();
const cacheExpiry = new Map<string, number>();

async function fetchGoogle(url: string, skipCache = false): Promise<CurlResponse> {
  if (!skipCache) {
    const expiresAt = cacheExpiry.get(url);
    if (expiresAt !== undefined && expiresAt > Date.now()) {
      return requestCache.get(url)!;
    }
  }

  const response = await rateLimiter.throttle(() => curlGet(url, { 'User-Agent': CHROME_USER_AGENT }));
  if (response.status === 200) {
    if (requestCache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = requestCache.keys().next().value;
      if (oldestKey !== undefined) {
        requestCache.delete(oldestKey);
        cacheExpiry.delete(oldestKey);
      }
    }
    requestCache.set(url, response);
    cacheExpiry.set(url, Date.now() + CACHE_TTL_MS);
  }
  return response;
}

// Test-only escape hatch — without this, a test reusing the same
// text/langs as an earlier test (to exercise a different mocked response
// shape) would silently get back the earlier test's now-cached response
// instead of the freshly mocked one.
export function __clearGoogleRequestCacheForTests(): void {
  requestCache.clear();
  cacheExpiry.clear();
}

// The fallback endpoint's response shape depends on whether `sl` was
// explicit or "auto" — confirmed live:
//   sl=en (explicit): ["Hallo Welt"]
//   sl=auto:           [["Hello world","fr"]]  (translatedText, detectedLang)
type RawGoogleFallbackResponse = [string] | [[string, string]];

function parseFallbackResult(raw: string): TranslationResult {
  const data: RawGoogleFallbackResponse = JSON.parse(raw);
  const first = data[0];
  if (typeof first === 'string') {
    if (!first) throw new Error('empty translation');
    return { translatedText: first };
  }
  const [translatedText, detectedSourceLang] = first;
  if (!translatedText) throw new Error('empty translation');
  return { translatedText, detectedSourceLang };
}

// Only ever called after the primary endpoint has already failed (see
// callGoogle) — a second failure here just means both are down, which the
// caller reports using the *primary* endpoint's error (more informative:
// this fallback has no dictionary data to explain a shape mismatch with).
async function fetchGoogleFallback(text: string, sourceLang: string, targetLang: string, skipCache: boolean): Promise<TranslationResult> {
  const params = new URLSearchParams({ client: 'dict-chrome-ex', sl: sourceLang, tl: targetLang, q: text });
  const response = await fetchGoogle(`${FALLBACK_ENDPOINT}?${params.toString()}`, skipCache);
  if (response.status !== 200) {
    throw new ProviderError('google', `Google Translate fallback endpoint also failed with status ${response.status}`);
  }
  try {
    return parseFallbackResult(response.body);
  } catch (error) {
    logProviderParseError('google', response.body, error);
    throw new ProviderError('google', 'Failed to parse Google Translate fallback response', error);
  }
}

function buildResult(data: RawGoogleFullResponse): TranslationResult {
  const translatedText = (data.sentences ?? []).map((sentence) => sentence.trans ?? '').join('');
  if (!translatedText) throw new Error('empty translation');
  return { translatedText, detectedSourceLang: data.src, dictionary: parseGoogleDictionary(data) };
}

async function requestGoogle(params: URLSearchParams, skipCache = false): Promise<RawGoogleFullResponse | undefined> {
  const response = await fetchGoogle(`${ENDPOINT}?${params.toString()}`, skipCache);
  if (response.status !== 200) return undefined;
  try {
    return JSON.parse(response.body);
  } catch {
    return undefined;
  }
}

// The sentence-level translator and the dictionary lookup are different
// Google subsystems that don't always agree on the top candidate word —
// e.g. translating "Бизнес" to German gives "Geschäft" as the sentence
// translation, but the dictionary's top noun candidate for that same query
// is "Business", so findArticleForWord finds nothing in the direct
// response. This is a best-effort fallback for that mismatch: translate
// the produced word to English (a pivot every article-using language has
// dictionary data against), then look up *that* English word's dictionary
// entry back in the target language and see if it happens to include the
// original word — as it did for "business" -> German, which surfaces
// "das Geschäft". Not guaranteed to find a match (the pivot's own top
// candidate might not be our word either); returns undefined rather than
// guessing when it doesn't. Costs up to 2 extra requests against an
// endpoint that's already sensitive to volume (see #94) — both go through
// fetchGoogle's cache like everything else here, so repeating the same
// lookup doesn't repeat the cost.
async function findTranslationGender(word: string, targetLang: string, skipCache: boolean): Promise<string | undefined> {
  const glossData = await requestGoogle(new URLSearchParams({ client: 'gtx', sl: targetLang, tl: 'en', dt: 't', dj: '1', q: word }), skipCache);
  const gloss = (glossData?.sentences ?? []).map((s) => s.trans ?? '').join('').trim();
  if (!gloss) return undefined;

  const dictData = await requestGoogle(new URLSearchParams({ client: 'gtx', sl: 'en', tl: targetLang, dt: 'bd', dj: '1', q: gloss }), skipCache);
  return dictData ? findArticleForWord(dictData, word) : undefined;
}

async function callGoogle(text: string, sourceLang: string, targetLang: string, includeExtras = true, skipCache = false): Promise<TranslationResult> {
  const params = new URLSearchParams({ client: 'gtx', sl: sourceLang, tl: targetLang, dj: '1' });
  // dt=t is the plain translation; the rest (issue #76) ask for the
  // dictionary breakdown Google's own clients show for single-word lookups
  // — bd (translations by part of speech), ss (synonyms), md (definitions),
  // ex (usage examples), at (alternative translations). dj=1 switches the
  // response from the legacy nested-array shape to the object shape these
  // extra sections are parsed from (see googleDictionary.ts). Skipped
  // entirely for lightweight calls (detectLanguage, isHealthy, and the
  // popup's back-translation) — those only ever read translatedText, so
  // the extra fields would just be wasted request weight against an
  // endpoint that's already sensitive to request volume (see #70, #94).
  const dtValues = includeExtras ? ['t', 'bd', 'ex', 'md', 'ss', 'at'] : ['t'];
  for (const dt of dtValues) {
    params.append('dt', dt);
  }
  params.append('q', text);

  // Plain `fetch` gets a 429 "automated queries" response from this
  // endpoint's TLS/HTTP2-handshake fingerprinting regardless of headers —
  // confirmed side by side with curl, which passes with the exact same
  // headers (see curlFetch.ts). Shelling out to curl for just this
  // provider sidesteps that fingerprint check.
  const response = await fetchGoogle(`${ENDPOINT}?${params.toString()}`, skipCache);
  if (response.status !== 200) {
    console.error(`[provider:google] request failed with status ${response.status} for text ${JSON.stringify(text)} (${sourceLang}->${targetLang})`, response.body.slice(0, 500));
    // Issue #109: dual-endpoint fallback — degraded (translation only, no
    // dictionary/gender data) beats a hard error while the primary
    // endpoint is down/rate-limited.
    try {
      return await fetchGoogleFallback(text, sourceLang, targetLang, skipCache);
    } catch (fallbackError) {
      console.error('[provider:google] fallback endpoint also failed', fallbackError);
      throw new ProviderError('google', `Google Translate request failed with status ${response.status}`);
    }
  }

  let data: RawGoogleFullResponse;
  try {
    data = JSON.parse(response.body);
  } catch (error) {
    logProviderParseError('google', response.body, error);
    throw new ProviderError('google', 'Failed to parse Google Translate response', error);
  }

  let result: TranslationResult;
  try {
    result = buildResult(data);
  } catch (error) {
    logProviderParseError('google', data, error);
    throw new ProviderError('google', 'Unexpected Google Translate response shape', error);
  }

  if (includeExtras && ARTICLE_LANGUAGES.has(targetLang) && !result.translatedText.includes(' ')) {
    result.genderArticle = findArticleForWord(data, result.translatedText) ?? (await findTranslationGender(result.translatedText, targetLang, skipCache));
  }

  // Mirrors the block above, for the *source* word instead of the
  // translated one — findTranslationGender(word, lang, ...) only cares
  // about word+lang, so the exact same pivot (word -> English gloss ->
  // dictionary lookup back into lang) works unchanged here, just called
  // with the source side of the pair instead of the target side. No fast
  // path via findArticleForWord(data, ...) here: `data`'s dict entries are
  // in targetLang, not sourceLang, so they'd never match the source word.
  const resolvedSourceLang = result.detectedSourceLang ?? sourceLang;
  const trimmedText = text.trim();
  if (includeExtras && ARTICLE_LANGUAGES.has(resolvedSourceLang) && !trimmedText.includes(' ')) {
    result.sourceGenderArticle = await findTranslationGender(trimmedText, resolvedSourceLang, skipCache);
  }

  return result;
}

export const googleProvider: TranslationProvider = {
  id: 'google',

  translate(text, sourceLang, targetLang, options) {
    return callGoogle(text, sourceLang, targetLang, !options?.lightweight, options?.skipCache);
  },

  async detectLanguage(text) {
    const result = await callGoogle(text, 'auto', 'en', false);
    if (!result.detectedSourceLang) {
      throw new ProviderError('google', 'Google Translate did not return a detected source language');
    }
    return result.detectedSourceLang;
  },

  async isHealthy() {
    const result = await callGoogle(HEALTH_CHECK_TEXT, 'en', 'de', false);
    return Boolean(result.translatedText);
  },
};
