import { ProviderCallResult, TranslateOptions, TranslationProvider, TranslationResult } from './types';

interface ProviderState {
  provider: TranslationProvider;
  lastSuccessAt: number | null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Owns every registered TranslationProvider and is the sole place that calls
 * into them. Every call is wrapped so a throwing/rejecting adapter can never
 * crash the app or affect any other provider — callers get back a result
 * object, never a rejected promise from provider code.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderState>();

  register(provider: TranslationProvider): void {
    this.providers.set(provider.id, { provider, lastSuccessAt: null });
  }

  listProviderIds(): string[] {
    return [...this.providers.keys()];
  }

  getLastSuccessAt(providerId: string): number | null {
    return this.providers.get(providerId)?.lastSuccessAt ?? null;
  }

  private async run<T>(providerId: string, fn: (provider: TranslationProvider) => Promise<T>): Promise<ProviderCallResult<T>> {
    const state = this.providers.get(providerId);
    if (!state) {
      return { ok: false, error: `Unknown provider: ${providerId}` };
    }
    try {
      const value = await fn(state.provider);
      state.lastSuccessAt = Date.now();
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: describeError(error) };
    }
  }

  translate(providerId: string, text: string, sourceLang: string, targetLang: string, options?: TranslateOptions): Promise<ProviderCallResult<TranslationResult>> {
    return this.run(providerId, (provider) => provider.translate(text, sourceLang, targetLang, options));
  }

  detectLanguage(providerId: string, text: string): Promise<ProviderCallResult<string>> {
    return this.run(providerId, (provider) => provider.detectLanguage(text));
  }

  checkHealth(providerId: string): Promise<ProviderCallResult<boolean>> {
    return this.run(providerId, (provider) => provider.isHealthy());
  }
}
