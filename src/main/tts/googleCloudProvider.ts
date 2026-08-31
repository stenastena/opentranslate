import { CHROME_USER_AGENT } from '../providers/browserHeaders';
import { curlGetBytes } from '../providers/curlFetch';
import { TTSProvider } from './types';

// Issue #107: the same unofficial endpoint Google's own translate.google.com
// "listen" button uses — confirmed live (2026-08-31) against
// translate.googleapis.com/translate_tts, matching the request shape
// ahatem/QTranslate's GoogleTTSService.kt uses (client=gtx primary,
// client=tw-ob fallback, 200-char chunking). No signup, no API key — same
// unofficial-endpoint trust model this app already uses for DeepL/Google/
// Yandex translation (see providers/curlFetch.ts).
const ENDPOINT = 'https://translate.googleapis.com/translate_tts';
const MAX_CHUNK_LENGTH = 200;
const MIME_TYPE = 'audio/mpeg';

// Greedy word-packing into chunks no longer than maxChunkLength — mirrors
// GoogleTTSService.kt's partitionText exactly (same algorithm, ported from
// its Kotlin fold). Splitting mid-word isn't attempted: a single word
// longer than the limit becomes its own (oversized) chunk rather than being
// cut, since Google's endpoint doesn't documented what happens to a broken
// word and this ported logic doesn't either.
function partitionText(text: string, maxChunkLength: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [''];
  for (const word of words) {
    const current = chunks[chunks.length - 1];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChunkLength) {
      chunks.push(word);
    } else {
      chunks[chunks.length - 1] = candidate;
    }
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

// Sequential, not parallel — matches GoogleTTSService.kt's own for loop.
// Chunk order matters (they're concatenated back into one utterance), and
// this endpoint is already known to be rate-limit-sensitive (issue #94);
// bursting N parallel requests for one popup click isn't worth the latency
// saved on what's normally 1-2 chunks for a captured-selection-length text.
async function fetchChunks(chunks: string[], lang: string, client: 'gtx' | 'tw-ob'): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const params = new URLSearchParams({ client, tl: lang, q: chunk });
    if (client === 'gtx') {
      params.set('ie', 'UTF-8');
      params.append('total', String(chunks.length));
      params.append('idx', String(idx));
      params.append('textlen', String(chunk.length));
    }
    const response = await curlGetBytes(`${ENDPOINT}?${params.toString()}`, { 'User-Agent': CHROME_USER_AGENT });
    if (response.status !== 200) {
      throw new Error(`Google Cloud TTS (${client}) request failed with status ${response.status}`);
    }
    buffers.push(response.body);
  }
  return Buffer.concat(buffers);
}

async function synthesize(text: string, lang: string): Promise<Buffer> {
  const chunks = partitionText(text, MAX_CHUNK_LENGTH);
  if (chunks.length === 0) return Buffer.alloc(0);
  try {
    return await fetchChunks(chunks, lang, 'gtx');
  } catch (primaryError) {
    console.error('[tts:google-cloud] primary endpoint failed, trying tw-ob fallback', primaryError);
    return fetchChunks(chunks, lang, 'tw-ob');
  }
}

export const googleCloudTtsProvider: TTSProvider = {
  id: 'google-cloud',

  async speak(text, lang) {
    const trimmed = text.trim();
    if (!trimmed) return { kind: 'audio', data: Buffer.alloc(0), mimeType: MIME_TYPE };
    const data = await synthesize(trimmed, lang || 'en');
    return { kind: 'audio', data, mimeType: MIME_TYPE };
  },

  // No server-side process — this provider only ever fetches bytes for the
  // caller to play. Stopping playback itself is the caller's job (see the
  // popup's own <audio> element in popup.ts).
  async stop() {},

  async isHealthy() {
    try {
      const data = await synthesize('hello', 'en');
      return data.length > 0;
    } catch {
      return false;
    }
  },

  // Fixed one-voice-per-language selection (see partitionText's caller) —
  // there's no per-voice enumeration to expose, unlike systemProvider's
  // SAPI voices.
  async listVoices() {
    return [];
  },
};
