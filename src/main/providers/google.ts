import { CHROME_USER_AGENT } from './browserHeaders';
import { curlGet } from './curlFetch';
import { findArticleForWord, parseGoogleDictionary, RawGoogleFullResponse } from './googleDictionary';
import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const HEALTH_CHECK_TEXT = 'hello';

// Target languages where Google's dict data attaches a definite article to
// noun entries (confirmed for de/fr; the rest are the other common
// article-using languages this endpoint is expected to behave the same
// way for — see findArticleForWord). Gated so the extra pivot lookup in
// findTranslationGender never fires for languages that could never have
// an article anyway (e.g. Russian, Chinese).
const ARTICLE_LANGUAGES = new Set(['de', 'fr', 'es', 'it', 'pt', 'nl']);

function buildResult(data: RawGoogleFullResponse): TranslationResult {
  const translatedText = (data.sentences ?? []).map((sentence) => sentence.trans ?? '').join('');
  if (!translatedText) throw new Error('empty translation');
  return { translatedText, detectedSourceLang: data.src, dictionary: parseGoogleDictionary(data) };
}

async function requestGoogle(params: URLSearchParams): Promise<RawGoogleFullResponse | undefined> {
  const response = await curlGet(`${ENDPOINT}?${params.toString()}`, { 'User-Agent': CHROME_USER_AGENT });
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
// guessing when it doesn't.
async function findTranslationGender(word: string, targetLang: string): Promise<string | undefined> {
  const glossData = await requestGoogle(new URLSearchParams({ client: 'gtx', sl: targetLang, tl: 'en', dt: 't', dj: '1', q: word }));
  const gloss = (glossData?.sentences ?? []).map((s) => s.trans ?? '').join('').trim();
  if (!gloss) return undefined;

  const dictData = await requestGoogle(new URLSearchParams({ client: 'gtx', sl: 'en', tl: targetLang, dt: 'bd', dj: '1', q: gloss }));
  return dictData ? findArticleForWord(dictData, word) : undefined;
}

async function callGoogle(text: string, sourceLang: string, targetLang: string, computeGender = true): Promise<TranslationResult> {
  const params = new URLSearchParams({ client: 'gtx', sl: sourceLang, tl: targetLang, dj: '1' });
  // dt=t is the plain translation; the rest (issue #76) ask for the
  // dictionary breakdown Google's own clients show for single-word lookups
  // — bd (translations by part of speech), ss (synonyms), md (definitions),
  // ex (usage examples), rw ("see also"), at (alternative translations).
  // ld/qca/rm are requested because DeepLX-style unofficial clients send
  // them alongside the others; harmless if unused. dj=1 switches the
  // response from the legacy nested-array shape to the object shape these
  // extra sections are parsed from (see googleDictionary.ts).
  for (const dt of ['t', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 'at']) {
    params.append('dt', dt);
  }
  params.append('q', text);

  // Plain `fetch` gets a 429 "automated queries" response from this
  // endpoint's TLS/HTTP2-handshake fingerprinting regardless of headers —
  // confirmed side by side with curl, which passes with the exact same
  // headers (see curlFetch.ts). Shelling out to curl for just this
  // provider sidesteps that fingerprint check.
  const response = await curlGet(`${ENDPOINT}?${params.toString()}`, { 'User-Agent': CHROME_USER_AGENT });
  if (response.status !== 200) {
    throw new ProviderError('google', `Google Translate request failed with status ${response.status}`);
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

  if (computeGender && ARTICLE_LANGUAGES.has(targetLang) && !result.translatedText.includes(' ')) {
    result.genderArticle = findArticleForWord(data, result.translatedText) ?? (await findTranslationGender(result.translatedText, targetLang));
  }

  return result;
}

export const googleProvider: TranslationProvider = {
  id: 'google',

  translate(text, sourceLang, targetLang) {
    return callGoogle(text, sourceLang, targetLang);
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
