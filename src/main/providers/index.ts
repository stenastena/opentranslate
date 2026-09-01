import { bingProvider } from './bingTranslate';
import { deeplProvider } from './deepl';
import { googleProvider } from './google';
import { myMemoryProvider } from './mymemory';
import { ProviderRegistry } from './registry';

// Issue #132: yandexProvider (./yandex) is deliberately not registered
// here — its unofficial endpoint has been permanently CAPTCHA-blocked
// since #70, confirmed still blocked with no working free route as of
// #75's 2026-09-01 investigation. The module and its tests are left in
// place (harmless, easy to revive if a paid Yandex Cloud key or a working
// free route ever materializes) — just not offered in the live app.
export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(deeplProvider);
  registry.register(googleProvider);
  registry.register(bingProvider);
  registry.register(myMemoryProvider);
  return registry;
}

export * from './types';
export { ProviderRegistry } from './registry';
