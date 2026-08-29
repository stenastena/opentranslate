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
  // used throughout settings/history — omit it to use the default voice.
  speak(text: string, lang?: string): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
