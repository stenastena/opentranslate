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

// What speak() actually did. Introduced alongside issue #107's cloud
// providers, which fetch audio bytes in the main process but have nothing
// in the main process that can play them — unlike systemProvider.ts, which
// plays through Windows' own audio output via PowerShell and can just
// resolve once that's done. 'played' keeps today's meaning (the provider
// produced sound itself, synchronously, before resolving); 'audio' hands
// the caller undecoded bytes to play wherever audio output is actually
// reachable (the popup's renderer, over IPC).
export type TTSSpeakResult = { kind: 'played' } | { kind: 'audio'; data: Buffer; mimeType: string };

/**
 * Speaks text aloud. Unlike TranslationProvider (see providers/types.ts),
 * a SAPI-backed implementation (systemProvider.ts) isn't shielding against
 * an unofficial endpoint changing shape — but the cloud implementations
 * added for issue #107 (googleCloudProvider.ts, bingCloudProvider.ts) are
 * exactly that: unofficial, reverse-engineered endpoints with the same
 * fragility as this app's translation providers.
 */
export interface TTSProvider {
  readonly id: string;
  // lang is a bare ISO 639-1 code (e.g. "de"), matching the codes already
  // used throughout settings/history. voiceName, when given and it names a
  // currently installed voice, takes priority over lang-based matching —
  // this is how a user's per-language voice choice (issue #89) overrides
  // the automatic fallback. Omit both to use the default voice. The cloud
  // providers only act on lang (their voice selection is a fixed per-
  // language table, not an installed-voice list) and ignore voiceName.
  speak(text: string, lang?: string, voiceName?: string): Promise<TTSSpeakResult>;
  stop(): Promise<void>;
  isHealthy(): Promise<boolean>;
  // Re-queries installed voices every call (never cached) so a voice
  // installed after app launch (e.g. a new SAPI voice pack) shows up
  // without a restart — see issue #89. The cloud providers' voice table is
  // fixed, not queried from anywhere, but still implement this so every
  // TTSProvider is interchangeable.
  listVoices(): Promise<TTSVoice[]>;
}
