import { randomUUID } from 'node:crypto';
import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

const TRANSLATE_ENDPOINT = 'https://translate.yandex.net/api/v1/tr.json/translate';
const DETECT_ENDPOINT = 'https://translate.yandex.net/api/v1/tr.json/detect';
const HEALTH_CHECK_TEXT = 'hello';

interface RawTranslateResponse {
  code: number;
  lang?: string;
  text?: string[];
  message?: string;
}

interface RawDetectResponse {
  code: number;
  lang?: string;
  message?: string;
}

// Yandex's own web client authenticates with a per-page session id (SID).
// The public tr-text service, used here, only needs a syntactically-valid
// "ucid"-shaped id (see CONTRIBUTING.md for how to re-derive this if Yandex
// starts rejecting synthetic ids).
function newRequestId(): string {
  return `${randomUUID().replace(/-/g, '')}-0-0`;
}

async function callYandex<T>(url: string, params: Record<string, string>, parse: (raw: string) => T): Promise<T> {
  const query = new URLSearchParams({ id: newRequestId(), srv: 'tr-text', ...params });
  const response = await fetch(`${url}?${query.toString()}`);
  const raw = await response.text();
  if (!response.ok) {
    throw new ProviderError('yandex', `Yandex Translate request failed with status ${response.status}`);
  }
  return parse(raw);
}

function parseTranslateResponse(raw: string): TranslationResult {
  let data: RawTranslateResponse;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('yandex', raw, error);
    throw new ProviderError('yandex', 'Failed to parse Yandex Translate response', error);
  }

  if (data.code !== 200 || !data.text) {
    logProviderParseError('yandex', raw, new Error(`code ${data.code}: ${data.message ?? 'unknown error'}`));
    throw new ProviderError('yandex', data.message ?? `Yandex Translate returned code ${data.code}`);
  }

  return {
    translatedText: data.text.join('\n'),
    detectedSourceLang: data.lang?.split('-')[0],
  };
}

function parseDetectResponse(raw: string): string {
  let data: RawDetectResponse;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('yandex', raw, error);
    throw new ProviderError('yandex', 'Failed to parse Yandex detect-language response', error);
  }

  if (data.code !== 200 || !data.lang) {
    logProviderParseError('yandex', raw, new Error(`code ${data.code}: ${data.message ?? 'unknown error'}`));
    throw new ProviderError('yandex', data.message ?? `Yandex detect-language returned code ${data.code}`);
  }

  return data.lang;
}

export const yandexProvider: TranslationProvider = {
  id: 'yandex',

  translate(text, sourceLang, targetLang) {
    const lang = sourceLang === 'auto' ? targetLang : `${sourceLang}-${targetLang}`;
    return callYandex(TRANSLATE_ENDPOINT, { lang, text }, parseTranslateResponse);
  },

  detectLanguage(text) {
    return callYandex(DETECT_ENDPOINT, { text }, parseDetectResponse);
  },

  async isHealthy() {
    const result = await this.translate(HEALTH_CHECK_TEXT, 'en', 'de');
    return Boolean(result.translatedText);
  },
};
