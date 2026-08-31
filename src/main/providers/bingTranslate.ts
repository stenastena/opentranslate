import { getBingAuth } from './bingAuth';
import { CHROME_USER_AGENT } from './browserHeaders';
import { curlPostForm } from './curlFetch';
import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

// Issue #97: Microsoft Translator via the same unofficial endpoint
// bing.com/translator's own UI calls — sidesteps the official Azure route's
// real blocker (a non-prepaid card is required even to stay on the free
// tier, confirmed by research logged on the issue) entirely. Ported from
// ahatem/QTranslate's BingTranslatorService.kt, using the same auth
// (providers/bingAuth.ts) the Bing TTS provider (issue #107) already
// scrapes from bing.com/translator. Confirmed live end-to-end (2026-09-01)
// against every language this app supports.
const TRANSLATE_URL = 'https://www.bing.com/ttranslatev3';
const HEALTH_CHECK_TEXT = 'hello';

// Bing's own language codes match this app's bare ISO codes directly for
// every language in renderer/shared/languages.ts except Chinese, which
// Bing splits into zh-Hans/zh-Hant with no bare "zh" — confirmed live
// (bare "zh" returns an in-body {"statusCode":400,...} error, not a real
// HTTP failure). "auto" maps to Bing's own "auto-detect" sentinel.
const TO_BING_LANG: Record<string, string> = { zh: 'zh-Hans' };
const FROM_BING_LANG: Record<string, string> = { 'zh-Hans': 'zh', 'zh-Hant': 'zh' };

function toBingLang(code: string): string {
  if (code === 'auto') return 'auto-detect';
  return TO_BING_LANG[code] ?? code;
}

function fromBingLang(code: string): string {
  return FROM_BING_LANG[code] ?? code;
}

interface RawBingTranslation {
  text: string;
  to: string;
}

interface RawBingDetectedLanguage {
  language: string;
  score?: number;
}

interface RawBingTranslateEntry {
  translations?: RawBingTranslation[];
  detectedLanguage?: RawBingDetectedLanguage;
}

// A successful call returns a JSON array with (usually) one entry carrying
// both fields below — but a rejected request (bad token, unsupported
// language, Bing's own captcha gate) still answers HTTP 200 with a
// differently-shaped body (a bare {"statusCode":...} or {"ShowCaptcha":...}
// object, not an array), so this can't just trust `Array.isArray` and
// index [0].
function parseTranslateResponse(raw: string): TranslationResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('bing', raw, error);
    throw new ProviderError('bing', 'Failed to parse Bing Translate response', error);
  }

  const entries = Array.isArray(data) ? (data as RawBingTranslateEntry[]) : [];
  const entry = entries.find((candidate) => candidate.translations && candidate.detectedLanguage);
  if (!entry?.translations || !entry.detectedLanguage) {
    logProviderParseError('bing', raw, new Error('response did not contain a translations/detectedLanguage entry'));
    throw new ProviderError('bing', `Unexpected Bing Translate response: ${raw.slice(0, 200)}`);
  }

  return {
    translatedText: entry.translations.map((t) => t.text).join(''),
    detectedSourceLang: fromBingLang(entry.detectedLanguage.language),
  };
}

async function requestBing(text: string, sourceLang: string, targetLang: string, forceRefreshAuth: boolean): Promise<TranslationResult> {
  const auth = await getBingAuth(forceRefreshAuth);
  const response = await curlPostForm(
    TRANSLATE_URL,
    { isVertical: '1', IG: auth.ig, IID: auth.iid },
    {
      text,
      fromLang: toBingLang(sourceLang),
      to: toBingLang(targetLang),
      token: auth.token,
      key: auth.key,
      isAuthv2: 'true',
    },
    { 'User-Agent': CHROME_USER_AGENT },
    auth.muid ? `MUID=${auth.muid}` : '',
  );

  if (response.status !== 200) {
    throw new ProviderError('bing', `Bing Translate request failed with status ${response.status}`);
  }
  return parseTranslateResponse(response.body);
}

// One forced-auth-refresh retry on any failure — same reasoning as
// bingCloudProvider.ts's synthesize(): a cached token can go stale between
// requests (Bing's own ~1hr lifetime, an earlier-than-expected server-side
// revocation, or — confirmed live — a *previous* request using a bad
// token/key poisoning that same IG session even for otherwise-valid
// follow-up requests).
async function callBing(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  try {
    return await requestBing(text, sourceLang, targetLang, false);
  } catch (error) {
    console.error('[provider:bing] request failed, retrying once with a fresh auth token', error);
    return requestBing(text, sourceLang, targetLang, true);
  }
}

export const bingProvider: TranslationProvider = {
  id: 'bing',

  translate(text, sourceLang, targetLang) {
    return callBing(text, sourceLang, targetLang);
  },

  async detectLanguage(text) {
    const result = await callBing(text, 'auto', 'en');
    if (!result.detectedSourceLang) {
      throw new ProviderError('bing', 'Bing Translate did not return a detected source language');
    }
    return result.detectedSourceLang;
  },

  async isHealthy() {
    const result = await callBing(HEALTH_CHECK_TEXT, 'en', 'de');
    return Boolean(result.translatedText);
  },
};
