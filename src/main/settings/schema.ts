export interface HotkeySettings {
  captureAndTranslate: string; // Electron accelerator string, e.g. "Control+`"
}

export interface LanguageSettings {
  autoDetectFirst: string;
  autoDetectSecond: string;
}

export interface ServiceSettings {
  deepl: boolean;
  yandex: boolean;
  google: boolean;
  // Issue #97: Microsoft Translator via the unofficial bing.com/translator
  // endpoint — see providers/bingTranslate.ts.
  bing: boolean;
}

// Issue #107: which TTS backend actually produces the audio. 'system' is
// the pre-#107 behavior (local SAPI voices via systemProvider.ts); the two
// cloud options are unofficial-endpoint providers with no local voice
// dependency (googleCloudProvider.ts / bingCloudProvider.ts).
export type TTSProviderId = 'system' | 'google-cloud' | 'bing-cloud';

export interface TTSSettings {
  provider: TTSProviderId;
  // Language code (e.g. "de") -> chosen SAPI voice name. Only consulted
  // when provider is 'system' (or as the fallback target when a cloud
  // provider's request fails — see ipc/handlers.ts). A language with no
  // entry here falls back to systemTtsProvider's automatic locale matching
  // — this is what keeps existing behavior unchanged for anyone who hasn't
  // opened the Voice settings section (issue #89).
  voiceByLang: Record<string, string>;
}

export interface AppSettings {
  hotkeys: HotkeySettings;
  languages: LanguageSettings;
  services: ServiceSettings;
  tts: TTSSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: { captureAndTranslate: "Control+`" },
  languages: { autoDetectFirst: 'en', autoDetectSecond: 'de' },
  services: { deepl: true, yandex: true, google: true, bing: true },
  // 'bing-cloud' by default: real Azure neural voices, the actual fix for
  // the recurring voice-quality complaint (#93) this issue exists to
  // address — 'google-cloud' and 'system' remain one Settings dropdown
  // away, and any cloud request that fails falls back to 'system'
  // automatically (see ipc/handlers.ts), so this default never leaves
  // someone stuck with total TTS silence just because a network call
  // failed.
  tts: { provider: 'bing-cloud', voiceByLang: {} },
};
