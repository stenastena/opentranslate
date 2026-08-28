import { createDefaultRegistry } from '../main/providers';

const TEST_PHRASE = 'Hello, world!';
const SOURCE_LANG = 'en';
const TARGET_LANG = 'de';

async function main(): Promise<void> {
  const registry = createDefaultRegistry();

  const results = await Promise.all(
    registry.listProviderIds().map(async (id) => {
      const startedAt = Date.now();
      const result = await registry.translate(id, TEST_PHRASE, SOURCE_LANG, TARGET_LANG);
      return { id, result, elapsedMs: Date.now() - startedAt };
    }),
  );

  console.table(
    results.map(({ id, result, elapsedMs }) => ({
      provider: id,
      status: result.ok ? 'OK' : 'FAIL',
      'result / error': result.ok ? result.value.translatedText : result.error,
      'time (ms)': elapsedMs,
    })),
  );

  process.exitCode = results.some(({ result }) => !result.ok) ? 1 : 0;
}

main();
