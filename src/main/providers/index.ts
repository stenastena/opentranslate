import { bingProvider } from './bingTranslate';
import { deeplProvider } from './deepl';
import { googleProvider } from './google';
import { ProviderRegistry } from './registry';
import { yandexProvider } from './yandex';

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(deeplProvider);
  registry.register(yandexProvider);
  registry.register(googleProvider);
  registry.register(bingProvider);
  return registry;
}

export * from './types';
export { ProviderRegistry } from './registry';
