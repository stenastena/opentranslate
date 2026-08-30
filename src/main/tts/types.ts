export interface TTSVoice {
  // The exact SAPI voice token name (e.g. "Microsoft Hazel Desktop") — pass
  // this back into speak()'s voiceName to select it explicitly.
  name: string;
  // Full locale string from the voice's Culture (e.g. "de-DE"), or "" if
  // the installed voice reports no culture.
  locale: string;
  // Bare ISO 639-1 code derived from locale (e.g. "de"), matching the
  // codes used throughout settings/history — used for locale-matching.
  langCode: string;
  description: string;
}

/**
 * Speaks text aloud. Unlike TranslationProvider (see providers/types.ts),
 * this isn't shielding against an unofficial endpoint changing shape — the
 * first implementation (systemProvider.ts) uses Windows' built-in SAPI
 * voices, which don't have that failure mode. The interface exists so a
 * future alternative (e.g. a cloud voice for a language with no installed
 * SAPI voice) can be swapped in without touching call sites.
 */
export interface TTSProvider {
  readonly id: string;
  // lang is a bare ISO 639-1 code (e.g. "de"), matching the codes already
  // used throughout settings/history. voiceName, when given and it names a
  // currently installed voice, takes priority over lang-based matching —
  // this is how a user's per-language voice choice (issue #89) overrides
  // the automatic fallback. Omit both to use the SAPI default voice.
  speak(text: string, lang?: string, voiceName?: string): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): Promise<boolean>;
  // Re-queries the OS for installed voices every call (never cached) so a
  // voice installed after app launch (e.g. a new SAPI voice pack) shows up
  // without a restart — see issue #89.
  listVoices(): Promise<TTSVoice[]>;
}
