import { logProviderParseError } from './logger';
import { ProviderError, TranslationProvider, TranslationResult } from './types';

const ENDPOINT = 'https://www2.deepl.com/jsonrpc?method=LMT_handle_texts';
const HEALTH_CHECK_TEXT = 'hello';

interface RawJsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  error?: { code: number; message: string };
  result?: {
    texts?: Array<{ text: string }>;
    lang?: string;
  };
}

// DeepL's web client (www.deepl.com) talks to this JSON-RPC endpoint with no
// API key, but rejects requests whose `id`/`timestamp` don't follow its
// undocumented pattern. This reproduces the well-known workaround (also used
// by the open-source DeepLX project): the request id is a multiple of 1000
// in DeepL's expected range, the timestamp is nudged to be a multiple of
// (count of "i" in the text) + 1, and — when the resulting id has certain
// remainders — the serialized JSON gets an extra space around "method" to
// match what DeepL's own client produces. See CONTRIBUTING.md if this ever
// needs re-deriving from a fresh capture of deepl.com's network traffic.
function randomRequestId(): number {
  return (Math.floor(Math.random() * 99999) + 8300000) * 1000;
}

function countOccurrencesOfI(text: string): number {
  return (text.match(/i/g) || []).length;
}

function buildTimestamp(iCount: number): number {
  const now = Date.now();
  if (iCount === 0) return now;
  const bump = iCount + 1;
  return now - (now % bump) + bump;
}

function serializeRequest(id: number, body: unknown): string {
  const serialized = JSON.stringify(body);
  const needsSpacing = (id + 5) % 29 === 0 || (id + 3) % 13 === 0;
  return needsSpacing ? serialized.replace('"method":"', '"method" : "') : serialized;
}

async function callDeepL(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  const id = randomRequestId();
  const body = {
    jsonrpc: '2.0',
    method: 'LMT_handle_texts',
    id,
    params: {
      texts: [{ text, requestAlternatives: 3 }],
      splitting: 'newlines',
      lang: {
        source_lang_user_selected: sourceLang === 'auto' ? 'auto' : sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      },
      timestamp: buildTimestamp(countOccurrencesOfI(text)),
    },
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializeRequest(id, body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new ProviderError('deepl', `DeepL request failed with status ${response.status}`);
  }

  let data: RawJsonRpcResponse;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    logProviderParseError('deepl', raw, error);
    throw new ProviderError('deepl', 'Failed to parse DeepL response', error);
  }

  if (data.error) {
    logProviderParseError('deepl', raw, new Error(`${data.error.code}: ${data.error.message}`));
    throw new ProviderError('deepl', data.error.message);
  }

  try {
    const translatedText = data.result!.texts![0].text;
    const detectedSourceLang = data.result!.lang?.toLowerCase();
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
