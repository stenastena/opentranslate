import { BingAuth, getBingAuth } from '../providers/bingAuth';
import { CHROME_USER_AGENT } from '../providers/browserHeaders';
import { curlPostFormBytes } from '../providers/curlFetch';
import { TTSProvider, TTSVoice } from './types';

// Issue #107: Bing Translator's own "listen" feature, via the same
// unofficial endpoint (www.bing.com/tfettts) ahatem/QTranslate's
// BingTTSService.kt uses — real Azure neural voices (e.g.
// "de-DE-KatjaNeural"), noticeably higher quality than both the local SAPI
// voices (#93) and Google's translate_tts (googleCloudProvider.ts). Auth
// (IG/IID/key/token/muid) comes from the shared providers/bingAuth.ts —
// also used by the Bing translation provider (issue #97), since both hit
// the same site with the same short-lived token. Confirmed live end-to-end
// (2026-08-31): fetching the translator page, extracting these values, and
// POSTing SSML with them to tfettts returns real audio/mpeg bytes.
const TTS_URL = 'https://www.bing.com/tfettts';
const MAX_CHUNK_LENGTH = 500;
const MIME_TYPE = 'audio/mpeg';

interface BingVoiceInfo {
  locale: string;
  gender: 'Male' | 'Female';
  shortName: string;
}

// Ported verbatim from BingTTSService.kt's defaultVoiceMap (ahatem/QTranslate,
// plugins/bing-services/src/main/kotlin/.../BingTTSService.kt) — Bing's TTS
// endpoint has no voice-discovery API of its own; this fixed table is the
// same one its own client ships. 'zh' is this app's own bare code for
// Chinese (see renderer/shared/languages.ts) and isn't in the upstream
// table, which only has zh-Hans/zh-Hant — added here pointing at the same
// voice zh-Hans uses.
const VOICE_MAP: Record<string, BingVoiceInfo> = {
  af: { locale: 'af-ZA', gender: 'Female', shortName: 'af-ZA-AdriNeural' },
  am: { locale: 'am-ET', gender: 'Female', shortName: 'am-ET-MekdesNeural' },
  ar: { locale: 'ar-SA', gender: 'Male', shortName: 'ar-SA-HamedNeural' },
  bg: { locale: 'bg-BG', gender: 'Male', shortName: 'bg-BG-BorislavNeural' },
  bn: { locale: 'bn-IN', gender: 'Female', shortName: 'bn-IN-TanishaaNeural' },
  ca: { locale: 'ca-ES', gender: 'Female', shortName: 'ca-ES-JoanaNeural' },
  cs: { locale: 'cs-CZ', gender: 'Male', shortName: 'cs-CZ-AntoninNeural' },
  cy: { locale: 'cy-GB', gender: 'Female', shortName: 'cy-GB-NiaNeural' },
  da: { locale: 'da-DK', gender: 'Female', shortName: 'da-DK-ChristelNeural' },
  de: { locale: 'de-DE', gender: 'Female', shortName: 'de-DE-KatjaNeural' },
  el: { locale: 'el-GR', gender: 'Male', shortName: 'el-GR-NestorasNeural' },
  en: { locale: 'en-US', gender: 'Female', shortName: 'en-US-AriaNeural' },
  es: { locale: 'es-ES', gender: 'Female', shortName: 'es-ES-ElviraNeural' },
  et: { locale: 'et-EE', gender: 'Female', shortName: 'et-EE-AnuNeural' },
  fa: { locale: 'fa-IR', gender: 'Female', shortName: 'fa-IR-DilaraNeural' },
  fi: { locale: 'fi-FI', gender: 'Female', shortName: 'fi-FI-NooraNeural' },
  fr: { locale: 'fr-FR', gender: 'Female', shortName: 'fr-FR-DeniseNeural' },
  ga: { locale: 'ga-IE', gender: 'Female', shortName: 'ga-IE-OrlaNeural' },
  gu: { locale: 'gu-IN', gender: 'Female', shortName: 'gu-IN-DhwaniNeural' },
  he: { locale: 'he-IL', gender: 'Male', shortName: 'he-IL-AvriNeural' },
  hi: { locale: 'hi-IN', gender: 'Female', shortName: 'hi-IN-SwaraNeural' },
  hr: { locale: 'hr-HR', gender: 'Male', shortName: 'hr-HR-SreckoNeural' },
  hu: { locale: 'hu-HU', gender: 'Male', shortName: 'hu-HU-TamasNeural' },
  id: { locale: 'id-ID', gender: 'Male', shortName: 'id-ID-ArdiNeural' },
  is: { locale: 'is-IS', gender: 'Female', shortName: 'is-IS-GudrunNeural' },
  it: { locale: 'it-IT', gender: 'Male', shortName: 'it-IT-DiegoNeural' },
  ja: { locale: 'ja-JP', gender: 'Female', shortName: 'ja-JP-NanamiNeural' },
  kk: { locale: 'kk-KZ', gender: 'Female', shortName: 'kk-KZ-AigulNeural' },
  km: { locale: 'km-KH', gender: 'Female', shortName: 'km-KH-SreymomNeural' },
  kn: { locale: 'kn-IN', gender: 'Female', shortName: 'kn-IN-SapnaNeural' },
  ko: { locale: 'ko-KR', gender: 'Female', shortName: 'ko-KR-SunHiNeural' },
  lo: { locale: 'lo-LA', gender: 'Female', shortName: 'lo-LA-KeomanyNeural' },
  lt: { locale: 'lt-LT', gender: 'Female', shortName: 'lt-LT-OnaNeural' },
  lv: { locale: 'lv-LV', gender: 'Female', shortName: 'lv-LV-EveritaNeural' },
  mk: { locale: 'mk-MK', gender: 'Female', shortName: 'mk-MK-MarijaNeural' },
  ml: { locale: 'ml-IN', gender: 'Female', shortName: 'ml-IN-SobhanaNeural' },
  mr: { locale: 'mr-IN', gender: 'Female', shortName: 'mr-IN-AarohiNeural' },
  ms: { locale: 'ms-MY', gender: 'Male', shortName: 'ms-MY-OsmanNeural' },
  mt: { locale: 'mt-MT', gender: 'Female', shortName: 'mt-MT-GraceNeural' },
  my: { locale: 'my-MM', gender: 'Female', shortName: 'my-MM-NilarNeural' },
  nb: { locale: 'nb-NO', gender: 'Female', shortName: 'nb-NO-PernilleNeural' },
  nl: { locale: 'nl-NL', gender: 'Female', shortName: 'nl-NL-ColetteNeural' },
  pl: { locale: 'pl-PL', gender: 'Female', shortName: 'pl-PL-ZofiaNeural' },
  ps: { locale: 'ps-AF', gender: 'Female', shortName: 'ps-AF-LatifaNeural' },
  pt: { locale: 'pt-BR', gender: 'Female', shortName: 'pt-BR-FranciscaNeural' },
  ro: { locale: 'ro-RO', gender: 'Male', shortName: 'ro-RO-EmilNeural' },
  ru: { locale: 'ru-RU', gender: 'Female', shortName: 'ru-RU-DariyaNeural' },
  sk: { locale: 'sk-SK', gender: 'Male', shortName: 'sk-SK-LukasNeural' },
  sl: { locale: 'sl-SI', gender: 'Male', shortName: 'sl-SI-RokNeural' },
  sv: { locale: 'sv-SE', gender: 'Female', shortName: 'sv-SE-SofieNeural' },
  ta: { locale: 'ta-IN', gender: 'Female', shortName: 'ta-IN-PallaviNeural' },
  te: { locale: 'te-IN', gender: 'Male', shortName: 'te-IN-ShrutiNeural' },
  th: { locale: 'th-TH', gender: 'Male', shortName: 'th-TH-NiwatNeural' },
  tr: { locale: 'tr-TR', gender: 'Female', shortName: 'tr-TR-EmelNeural' },
  uk: { locale: 'uk-UA', gender: 'Female', shortName: 'uk-UA-PolinaNeural' },
  ur: { locale: 'ur-IN', gender: 'Female', shortName: 'ur-IN-GulNeural' },
  uz: { locale: 'uz-UZ', gender: 'Female', shortName: 'uz-UZ-MadinaNeural' },
  vi: { locale: 'vi-VN', gender: 'Male', shortName: 'vi-VN-NamMinhNeural' },
  zh: { locale: 'zh-CN', gender: 'Female', shortName: 'zh-CN-XiaoxiaoNeural' },
};

function escapeSsml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSsml(text: string, voice: BingVoiceInfo): string {
  return `<speak version='1.0' xml:lang='${voice.locale}'><voice xml:lang='${voice.locale}' xml:gender='${voice.gender}' name='${voice.shortName}'><prosody rate='+0.00%'>${escapeSsml(text)}</prosody></voice></speak>`;
}

function voiceInfoFor(lang: string | undefined, voiceName: string | undefined): BingVoiceInfo {
  if (voiceName) {
    const byName = Object.values(VOICE_MAP).find((info) => info.shortName === voiceName);
    if (byName) return byName;
  }
  return VOICE_MAP[lang ?? 'en'] ?? VOICE_MAP.en;
}

// Same greedy word-packing as googleCloudProvider's partitionText, just
// with Bing's own (much larger) per-request chunk limit — see
// BingTTSService.kt's partitionText/MAX_CHUNK_LENGTH.
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

async function synthesizeChunk(chunk: string, voice: BingVoiceInfo, auth: BingAuth): Promise<Buffer> {
  const response = await curlPostFormBytes(
    TTS_URL,
    { isVertical: '1', IG: auth.ig, IID: auth.iid },
    { ssml: buildSsml(chunk, voice), token: auth.token, key: auth.key },
    { 'User-Agent': CHROME_USER_AGENT },
    auth.muid ? `MUID=${auth.muid}` : '',
  );
  if (response.status !== 200) {
    throw new Error(`Bing TTS request failed with status ${response.status}`);
  }
  return response.body;
}

// One forced-auth-refresh retry on any failure: a cached token can go stale
// between requests (Bing's own ~1hr lifetime, or an earlier-than-expected
// server-side revocation) — this covers both without paying the auth
// page's extra request on every single speak() call.
async function synthesize(text: string, lang: string | undefined, voiceName: string | undefined): Promise<Buffer> {
  const chunks = partitionText(text, MAX_CHUNK_LENGTH);
  if (chunks.length === 0) return Buffer.alloc(0);
  const voice = voiceInfoFor(lang, voiceName);

  const attempt = async (forceRefresh: boolean): Promise<Buffer> => {
    const auth = await getBingAuth(forceRefresh);
    const parts = await Promise.all(chunks.map((chunk) => synthesizeChunk(chunk, voice, auth)));
    return Buffer.concat(parts);
  };

  try {
    return await attempt(false);
  } catch (error) {
    console.error('[tts:bing-cloud] request failed, retrying once with a fresh auth token', error);
    return attempt(true);
  }
}

export const bingCloudTtsProvider: TTSProvider = {
  id: 'bing-cloud',

  async speak(text, lang, voiceName) {
    const trimmed = text.trim();
    if (!trimmed) return { kind: 'audio', data: Buffer.alloc(0), mimeType: MIME_TYPE };
    const data = await synthesize(trimmed, lang, voiceName);
    return { kind: 'audio', data, mimeType: MIME_TYPE };
  },

  // No server-side process — same as googleCloudProvider, stopping
  // playback itself is the caller's job.
  async stop() {},

  async isHealthy() {
    try {
      const data = await synthesize('hello', 'en', undefined);
      return data.length > 0;
    } catch {
      return false;
    }
  },

  // Fixed per-language voice table (VOICE_MAP above), not queried from
  // anywhere — exposed as TTSVoice entries so a future per-language picker
  // for this provider (mirroring #89's SAPI one) has something to list,
  // though this PR's Settings UI only offers the provider-level choice.
  async listVoices(): Promise<TTSVoice[]> {
    return Object.entries(VOICE_MAP).map(([langCode, info]) => ({
      name: info.shortName,
      locale: info.locale,
      langCode,
      description: `${info.shortName} (${info.gender})`,
    }));
  },
};
