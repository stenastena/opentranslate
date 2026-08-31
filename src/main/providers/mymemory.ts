import { CHROME_USER_AGENT } from './browserHeaders';
import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

// Issue #96: MyMemory Translation (https://mymemory.translated.net/doc/spec.php)
// — a real, documented public API (not a reverse-engineered unofficial
// endpoint like the other three), so no curl/TLS-fingerprint workaround is
// needed here; plain fetch works. Free, anonymous use needs no signup or
// API key at all (~5,000 chars/day/IP, confirmed via the docs — this
// adapter doesn't set the optional `de=` email param that raises that
// limit, since that's a per-user opt-in this app has no account system to
// collect it through).
//
// Its answers come from a translation-memory corpus (real human/
// professional translations, not pure neural MT) mixed with a neural
// fallback when no memory match exists — generally strong for common EU
// language pairs, more inconsistent elsewhere, and occasionally a stored
// memory entry is just wrong (confirmed live: a lookup for "Hello, world!"
// -> "de" returned the English text itself as the top "translation",
// beaten out by a lower-scored but correct entry). That's an accepted,
// documented characteristic of this service, not something to work around
// here — same "unofficial/community-sourced, can be inconsistent" caveat
// this app already accepts for its other providers.
const ENDPOINT = 'https://api.mymemory.translated.net/get';
// MyMemory's own free-tier limit — confirmed live (a 750-char request
// returns a clean in-body "QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY :
// 500 CHARS" error, HTTP 200). Checked client-side so an over-limit
// request fails immediately with a clear message instead of a round trip.
const MAX_QUERY_LENGTH = 500;
const HEALTH_CHECK_TEXT = 'hello';

interface RawMyMemoryResponse {
  responseData?: {
    translatedText?: string;
    // Only present when langpair's source half is "autodetect" — see
    // callMyMemory. Already a bare code (e.g. "en", "ru") matching this
    // app's own convention, confirmed live.
    detectedLanguage?: string;
  };
  // A genuine number (200) on success but a *string* ("403") on every
  // error case confirmed live (query-too-long, invalid language, empty
  // query) — Number(...) below normalizes both before comparing.
  responseStatus?: number | string;
  responseDetails?: string;
}

async function callMyMemory(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  if (text.length > MAX_QUERY_LENGTH) {
    throw new ProviderError('mymemory', `Text is too long for MyMemory's free tier (${text.length} > ${MAX_QUERY_LENGTH} characters)`);
  }

  // MyMemory has no bare "auto" sentinel of its own — "autodetect" is its
  // documented spelling, confirmed live (returns responseData.detectedLanguage).
  // Every language code this app uses (including "zh", unlike Bing) matches
  // MyMemory's own directly — confirmed live, no mapping table needed.
  const langpair = `${sourceLang === 'auto' ? 'autodetect' : sourceLang}|${targetLang}`;
  const params = new URLSearchParams({ q: text, langpair });

  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { 'User-Agent': CHROME_USER_AGENT },
  });

  let data: RawMyMemoryResponse;
  try {
    data = (await response.json()) as RawMyMemoryResponse;
  } catch (error) {
    logProviderParseError('mymemory', await response.text().catch(() => '<unreadable body>'), error);
    throw new ProviderError('mymemory', 'Failed to parse MyMemory response', error);
  }

  if (Number(data.responseStatus) !== 200 || !data.responseData?.translatedText) {
    logProviderParseError('mymemory', data, new Error(`status ${data.responseStatus}: ${data.responseDetails ?? 'unknown error'}`));
    throw new ProviderError('mymemory', data.responseDetails || `MyMemory returned status ${data.responseStatus}`);
  }

  return {
    translatedText: data.responseData.translatedText,
    detectedSourceLang: data.responseData.detectedLanguage,
  };
}

export const myMemoryProvider: TranslationProvider = {
  id: 'mymemory',

  translate(text, sourceLang, targetLang) {
    return callMyMemory(text, sourceLang, targetLang);
  },

  async detectLanguage(text) {
    const result = await callMyMemory(text, 'auto', 'en');
    if (!result.detectedSourceLang) {
      throw new ProviderError('mymemory', 'MyMemory did not return a detected source language');
    }
    return result.detectedSourceLang;
  },

  async isHealthy() {
    const result = await callMyMemory(HEALTH_CHECK_TEXT, 'en', 'de');
    return Boolean(result.translatedText);
  },
};
