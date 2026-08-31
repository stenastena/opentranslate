// Issue #109: proactive self-throttling, not just reactive backoff.
// curlGet/curlPostForm (#94) already retry *after* hitting a 429/503 —
// this complements that by spacing requests out *before* ever hitting the
// limit in the first place, the same technique ahatem/QTranslate's own
// Yandex Web and Reverso clients use (a Mutex enforcing a minimum
// interval between requests — 750ms and 600ms respectively, confirmed
// from their source).

// A queue of promises rather than a single "next allowed time" timestamp:
// concurrent calls need to serialize *and* space out relative to each
// other, not just relative to the last completed call — two calls fired
// at once must still end up minIntervalMs apart from each other, not both
// waiting on the same already-past deadline.
export function createRateLimiter(minIntervalMs: number) {
  let interval = minIntervalMs;
  let queue: Promise<void> = Promise.resolve();
  let lastRunAt = 0;

  function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const scheduled = queue.then(async () => {
      const wait = lastRunAt + interval - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      lastRunAt = Date.now();
    });
    queue = scheduled;
    return scheduled.then(fn);
  }

  // Test-only escape hatches. Real tests care that throttling *happens*
  // (see rateLimiter.test.ts), not that a mocked-network test suite pays
  // real wall-clock delays for it — a provider test file with several
  // multi-request cases (retries, fallbacks, pivots) would otherwise add
  // real seconds to every run for no signal. __resetForTests() clears the
  // module-level singleton's pacing state between tests (without it, one
  // test's calls would leave the next test waiting out a stale cooldown);
  // __setIntervalForTests() lets a suite that isn't testing the throttle
  // itself shrink it to 0 for the whole file.
  function __resetForTests(): void {
    queue = Promise.resolve();
    lastRunAt = 0;
  }

  function __setIntervalForTests(ms: number): void {
    interval = ms;
  }

  return { throttle, __resetForTests, __setIntervalForTests };
}
