export interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
}

/**
 * Every translation service is called through an unofficial, reverse-engineered
 * endpoint (see CONTRIBUTING.md). Implementations MUST NOT let a network or
 * parsing failure escape as an unhandled rejection from anywhere other than
 * their own public methods — the registry is what turns that failure into an
 * isolated per-provider result instead of an app-wide crash.
 */
export interface TranslationProvider {
  readonly id: string; // 'deepl' | 'yandex' | 'google'
  translate(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
  isHealthy(): Promise<boolean>;
}

export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type ProviderCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
