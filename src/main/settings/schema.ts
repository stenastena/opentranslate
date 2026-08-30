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
}

export interface TTSSettings {
  // Language code (e.g. "de") -> chosen SAPI voice name. A language with no
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
  services: { deepl: true, yandex: true, google: true },
  tts: { voiceByLang: {} },
};
