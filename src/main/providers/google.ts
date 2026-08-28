import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const HEALTH_CHECK_TEXT = 'hello';

// The unofficial "gtx" client used by translate.google.com itself. No API
// key. Response shape (dt=t): [[[translatedChunk, originalChunk, ...], ...], null, detectedSourceLang]
type RawGoogleResponse = [Array<[string, string, ...unknown[]]>, unknown, string?];

function parseResponse(raw: string): TranslationResult {
  let data: RawGoogleResponse;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('google', raw, error);
    throw new ProviderError('google', 'Failed to parse Google Translate response', error);
  }

  try {
    const translatedText = data[0].map((segment) => segment[0]).join('');
    const detectedSourceLang = data[2];
    if (!translatedText) throw new Error('empty translation');
    return { translatedText, detectedSourceLang };
  } catch (error) {
    logProviderParseError('google', data, error);
    throw new ProviderError('google', 'Unexpected Google Translate response shape', error);
  }
}

async function callGoogle(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    q: text,
  });

  const response = await fetch(`${ENDPOINT}?${params.toString()}`);
  const raw = await response.text();
  if (!response.ok) {
    throw new ProviderError('google', `Google Translate request failed with status ${response.status}`);
  }
  return parseResponse(raw);
}

export const googleProvider: TranslationProvider = {
  id: 'google',

  translate(text, sourceLang, targetLang) {
    return callGoogle(text, sourceLang, targetLang);
  },

  async detectLanguage(text) {
    const result = await callGoogle(text, 'auto', 'en');
    if (!result.detectedSourceLang) {
      throw new ProviderError('google', 'Google Translate did not return a detected source language');
    }
    return result.detectedSourceLang;
  },

  async isHealthy() {
    const result = await callGoogle(HEALTH_CHECK_TEXT, 'en', 'de');
    return Boolean(result.translatedText);
  },
};
