import { randomUUID } from 'node:crypto';
import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

// DeepL's legacy `www2.deepl.com/jsonrpc` LMT_handle_texts backend (what
// this adapter used to call) now rate-limits anonymous traffic hard and
// returns HTTP 429 on effectively every request, regardless of the
// id/timestamp/JSON-spacing anti-bot trick or a realistic browser
// User-Agent — confirmed on the real dev machine (see issue #70). DeepL's
// interactive clients (web, Chrome extension, iOS app) have moved to a
// separate, unauthenticated "oneshot" endpoint instead. This impersonates
// the iOS app's request shape (reverse-engineered from DeepL iOS
// 26.42/5443737's ItaClient oneshot path — see e.g. the OwO-Network/DeepLX
// project for an independent reproduction). Re-derive the app_information
// version fields and User-Agent from a fresh iOS build if this ever starts
// getting rejected — a stale-but-shipped iOS version number is fine, but a
// version that never shipped is a cheap bot signal DeepL checks for.
const ENDPOINT = 'https://oneshot-free.www.deepl.com/v1/translate';
const HEALTH_CHECK_TEXT = 'hello';

const IOS_APP_VERSION = '26.42';
const IOS_APP_BUILD = '5443737';
const IOS_OS_VERSION = '26.0';
const USER_AGENT = `DeepL/${IOS_APP_VERSION} CFNetwork/3826.600.41 Darwin/25.0.0`;

// Stable for the process lifetime, like a real installed app's identifiers.
const instanceId = randomUUID();
const sessionId = randomUUID();

// The oneshot endpoint deprecated bare "EN"/"PT"/"ZH" in favour of
// regional/script variants; every other 2-letter code passes through
// lowercased. This app only ever deals in simple codes (see
// settings/schema.ts), so the full DeepL language table isn't needed.
const TARGET_LANG_OVERRIDES: Record<string, string> = { en: 'en-US', pt: 'pt-BR', zh: 'zh-Hans' };

function normalizeTargetLang(code: string): string {
  const lower = code.toLowerCase();
  return TARGET_LANG_OVERRIDES[lower] ?? lower;
}

function normalizeSourceLang(code: string): string | undefined {
  if (code === 'auto') return undefined;
  const lower = code.toLowerCase();
  return lower === 'zh' ? 'zh-Hans' : lower;
}

interface OneshotResponse {
  translations?: Array<{ text?: string; detected_source_language?: string }>;
  title?: string;
  message?: string;
}

async function callDeepL(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  const body = {
    text: [text],
    target_lang: normalizeTargetLang(targetLang),
    source_lang: normalizeSourceLang(sourceLang),
    usage_type: 'translate',
    app_information: {
      os: 'iOS',
      os_version: IOS_OS_VERSION,
      app_version: IOS_APP_VERSION,
      app_build: IOS_APP_BUILD,
      instance_id: instanceId,
    },
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'None',
      'User-Agent': USER_AGENT,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'x-app-os-version': IOS_OS_VERSION,
      'x-app-instance-id': instanceId,
      'x-app-session-id': sessionId,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();

  if (!response.ok) {
    let data: OneshotResponse = {};
    try {
      data = JSON.parse(raw);
    } catch {
      // Fall through with no parsed body — the status-based message below still applies.
    }
    const message = data.title || data.message;
    logProviderParseError('deepl', raw, new Error(`HTTP ${response.status}${message ? `: ${message}` : ''}`));
    throw new ProviderError('deepl', message ?? `DeepL request failed with status ${response.status}`);
  }

  let data: OneshotResponse;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('deepl', raw, error);
    throw new ProviderError('deepl', 'Failed to parse DeepL response', error);
  }

  try {
    const translation = data.translations![0];
    const translatedText = translation.text;
    const detectedSourceLang = translation.detected_source_language?.toLowerCase();
    if (!translatedText) throw new Error('empty translation');
    return { translatedText, detectedSourceLang };
  } catch (error) {
    logProviderParseError('deepl', raw, error);
    throw new ProviderError('deepl', 'Unexpected DeepL response shape', error);
  }
}

export const deeplProvider: TranslationProvider = {
  id: 'deepl',

  translate(text, sourceLang, targetLang) {
    return callDeepL(text, sourceLang, targetLang);
  },

  async detectLanguage(text) {
    const result = await callDeepL(text, 'auto', 'en');
    if (!result.detectedSourceLang) {
      throw new ProviderError('deepl', 'DeepL did not return a detected source language');
    }
    return result.detectedSourceLang;
  },

  async isHealthy() {
    const result = await callDeepL(HEALTH_CHECK_TEXT, 'en', 'de');
    return Boolean(result.translatedText);
  },
};
