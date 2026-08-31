import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const { curlGet, curlGetBytes, curlPostFormBytes } = await import('./curlFetch');

type ExecFileCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;
type ExecFileBufferCallback = (error: Error | null, stdout?: Buffer) => void;

function respondWith(status: number, body: string) {
  return (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
    cb(null, { stdout: `${body}\nHTTPSTATUS:${status}`, stderr: '' });
  };
}

function respondWithBytes(status: number, body: Buffer) {
  return (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileBufferCallback) => {
    cb(null, Buffer.concat([body, Buffer.from(`\nHTTPSTATUS:${status}`, 'utf-8')]));
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

describe('curlGetBytes', () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it('returns binary bytes unmangled on success', async () => {
    const audio = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x0a]);
    execFileMock.mockImplementation(respondWithBytes(200, audio));

    const result = await curlGetBytes('https://example.com', {});

    expect(result.status).toBe(200);
    expect(result.body).toEqual(audio);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('finds the real trailing delimiter via lastIndexOf even if the byte sequence appears earlier in the body', async () => {
    // Deliberately plants the literal delimiter text inside the "audio"
    // bytes to prove the split isn't fooled by an earlier occurrence —
    // lastIndexOf always anchors on the one curl actually appended.
    const audio = Buffer.from('before\nHTTPSTATUS:999after', 'utf-8');
    execFileMock.mockImplementation(respondWithBytes(200, audio));

    const result = await curlGetBytes('https://example.com', {});

    expect(result.status).toBe(200);
    expect(result.body).toEqual(audio);
  });

  it('retries a 429 and returns the successful response once it clears', async () => {
    execFileMock.mockImplementationOnce(respondWithBytes(429, Buffer.alloc(0))).mockImplementationOnce(respondWithBytes(200, Buffer.from('ok')));

    const result = await curlGetBytes('https://example.com', {}, 3, 0);

    expect(result).toEqual({ status: 200, body: Buffer.from('ok') });
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it('throws when curl output has no status delimiter', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileBufferCallback) => {
      cb(null, Buffer.from('garbage with no delimiter', 'utf-8'));
    });

    await expect(curlGetBytes('https://example.com', {})).rejects.toThrow('did not contain the expected status delimiter');
  });
});

describe('curlPostFormBytes', () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it('posts form data and query params, returning binary bytes on success', async () => {
    execFileMock.mockImplementation(respondWithBytes(200, Buffer.from('audio')));

    const result = await curlPostFormBytes('https://example.com/tts', { a: '1' }, { text: 'hello' }, { 'User-Agent': 'x' }, 'MUID=abc');

    expect(result).toEqual({ status: 200, body: Buffer.from('audio') });
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args).toContain('https://example.com/tts?a=1');
    expect(args).toContain('Cookie: MUID=abc');
    expect(args).toContain('--data-urlencode');
    expect(args).toContain('text=hello');
  });

  it('omits the Cookie header when no cookie string is given', async () => {
    execFileMock.mockImplementation(respondWithBytes(200, Buffer.from('audio')));

    await curlPostFormBytes('https://example.com/tts', {}, { text: 'hi' }, {}, '');

    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args.some((arg) => arg.startsWith('Cookie:'))).toBe(false);
  });

  it('retries a 503 and returns the successful response once it clears', async () => {
    execFileMock.mockImplementationOnce(respondWithBytes(503, Buffer.alloc(0))).mockImplementationOnce(respondWithBytes(200, Buffer.from('ok')));

    const result = await curlPostFormBytes('https://example.com', {}, {}, {}, '', 3, 0);

    expect(result).toEqual({ status: 200, body: Buffer.from('ok') });
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});
