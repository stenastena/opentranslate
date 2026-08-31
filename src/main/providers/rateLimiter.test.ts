import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rateLimiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the first call immediately, with no wait', async () => {
    const { throttle } = createRateLimiter(500);
    const fn = vi.fn().mockResolvedValue('ok');

    const promise = throttle(fn);
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('delays a second call until the minimum interval has passed', async () => {
    const { throttle } = createRateLimiter(500);
    const order: number[] = [];
    const fn = (n: number) => async () => {
      order.push(n);
      return n;
    };

    const first = throttle(fn(1));
    await vi.advanceTimersByTimeAsync(0);
    await first;

    const second = throttle(fn(2));
    // Not yet run — less than 500ms since the first call completed.
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual([1]);

    await vi.advanceTimersByTimeAsync(400);
    await second;
    expect(order).toEqual([1, 2]);
  });

  it('does not add extra delay when calls are already spaced out naturally', async () => {
    const { throttle } = createRateLimiter(500);
    const fn = vi.fn().mockResolvedValue(undefined);

    await throttle(fn);
    await vi.advanceTimersByTimeAsync(1000); // plenty of real time passes between calls
    await throttle(fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent calls so each is spaced from the one before it, not all from the same deadline', async () => {
    const { throttle } = createRateLimiter(100);
    const order: number[] = [];
    const make = (n: number) => async () => {
      order.push(n);
    };

    const calls = [throttle(make(1)), throttle(make(2)), throttle(make(3))];
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(calls);

    expect(order).toEqual([1, 2, 3]);
  });
});
