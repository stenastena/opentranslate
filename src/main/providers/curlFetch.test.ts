import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const { curlGet } = await import('./curlFetch');

type ExecFileCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

function respondWith(status: number, body: string) {
  return (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
    cb(null, { stdout: `${body}\nHTTPSTATUS:${status}`, stderr: '' });
  };
}

describe('curlGet', () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it('returns the response on a normal success with no retry', async () => {
    execFileMock.mockImplementation(respondWith(200, '{"ok":true}'));

    const result = await curlGet('https://example.com', {});

    expect(result).toEqual({ status: 200, body: '{"ok":true}' });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 and returns the successful response once it clears', async () => {
    execFileMock
      .mockImplementationOnce(respondWith(429, 'rate limited'))
      .mockImplementationOnce(respondWith(200, '{"ok":true}'));

    const result = await curlGet('https://example.com', {}, 3, 0);

    expect(result).toEqual({ status: 200, body: '{"ok":true}' });
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts and returns the last (still-429) response', async () => {
    execFileMock.mockImplementation(respondWith(429, 'rate limited'));

    const result = await curlGet('https://example.com', {}, 3, 0);

    expect(result).toEqual({ status: 429, body: 'rate limited' });
    expect(execFileMock).toHaveBeenCalledTimes(3);
  });

  it('retries a 503 the same way as a 429', async () => {
    execFileMock.mockImplementationOnce(respondWith(503, 'overloaded')).mockImplementationOnce(respondWith(200, 'ok'));

    const result = await curlGet('https://example.com', {}, 3, 0);

    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable status like 404', async () => {
    execFileMock.mockImplementation(respondWith(404, 'not found'));

    const result = await curlGet('https://example.com', {}, 3, 0);

    expect(result).toEqual({ status: 404, body: 'not found' });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('throws when curl output has no status delimiter', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, { stdout: 'garbage with no delimiter', stderr: '' });
    });

    await expect(curlGet('https://example.com', {})).rejects.toThrow('did not contain the expected status delimiter');
  });
});
