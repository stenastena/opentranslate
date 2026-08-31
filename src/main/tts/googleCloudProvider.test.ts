import { beforeEach, describe, expect, it, vi } from 'vitest';

const curlGetBytesMock = vi.fn();
vi.mock('../providers/curlFetch', () => ({
  curlGetBytes: (...args: unknown[]) => curlGetBytesMock(...args),
}));

const { googleCloudTtsProvider } = await import('./googleCloudProvider');

describe('googleCloudTtsProvider', () => {
  beforeEach(() => {
    curlGetBytesMock.mockReset();
  });

  it('speaks short text with a single gtx request', async () => {
    curlGetBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('audio-bytes') });

    const result = await googleCloudTtsProvider.speak('hello world', 'en');

    expect(result).toEqual({ kind: 'audio', data: Buffer.from('audio-bytes'), mimeType: 'audio/mpeg' });
    expect(curlGetBytesMock).toHaveBeenCalledTimes(1);
    const [url] = curlGetBytesMock.mock.calls[0];
    expect(url).toContain('client=gtx');
    expect(url).toContain('tl=en');
    expect(url).toContain('ie=UTF-8');
  });

  it('defaults to English when no language is given', async () => {
    curlGetBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('x') });

    await googleCloudTtsProvider.speak('hello');

    const [url] = curlGetBytesMock.mock.calls[0];
    expect(url).toContain('tl=en');
  });

  it('chunks text over 200 characters into multiple requests and concatenates the audio in order', async () => {
    curlGetBytesMock.mockResolvedValueOnce({ status: 200, body: Buffer.from('first-') }).mockResolvedValueOnce({ status: 200, body: Buffer.from('second') });
    const longText = ['a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50), 'd'.repeat(50)].join(' ');

    const result = await googleCloudTtsProvider.speak(longText, 'en');

    expect(curlGetBytesMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ kind: 'audio', data: Buffer.from('first-second'), mimeType: 'audio/mpeg' });
    const [firstUrl] = curlGetBytesMock.mock.calls[0];
    const [secondUrl] = curlGetBytesMock.mock.calls[1];
    expect(firstUrl).toContain('idx=0');
    expect(secondUrl).toContain('idx=1');
  });

  it('falls back to the tw-ob client when the primary gtx endpoint fails', async () => {
    curlGetBytesMock.mockResolvedValueOnce({ status: 429, body: Buffer.alloc(0) }).mockResolvedValueOnce({ status: 200, body: Buffer.from('fallback-audio') });

    const result = await googleCloudTtsProvider.speak('hi', 'de');

    expect(result).toEqual({ kind: 'audio', data: Buffer.from('fallback-audio'), mimeType: 'audio/mpeg' });
    const [, secondCallArgs] = curlGetBytesMock.mock.calls;
    expect(secondCallArgs[0]).toContain('client=tw-ob');
  });

  it('throws when both the primary and fallback endpoints fail', async () => {
    curlGetBytesMock.mockResolvedValue({ status: 500, body: Buffer.alloc(0) });

    await expect(googleCloudTtsProvider.speak('hi', 'de')).rejects.toThrow('tw-ob');
  });

  it('returns empty audio for blank text without making a request', async () => {
    const result = await googleCloudTtsProvider.speak('   ', 'en');

    expect(result).toEqual({ kind: 'audio', data: Buffer.alloc(0), mimeType: 'audio/mpeg' });
    expect(curlGetBytesMock).not.toHaveBeenCalled();
  });

  it('isHealthy returns true after a successful synthesis', async () => {
    curlGetBytesMock.mockResolvedValue({ status: 200, body: Buffer.from('x') });

    await expect(googleCloudTtsProvider.isHealthy()).resolves.toBe(true);
  });

  it('isHealthy returns false when both endpoints fail', async () => {
    curlGetBytesMock.mockResolvedValue({ status: 500, body: Buffer.alloc(0) });

    await expect(googleCloudTtsProvider.isHealthy()).resolves.toBe(false);
  });

  it('listVoices returns an empty list — voice selection is fixed per language, not enumerable', async () => {
    await expect(googleCloudTtsProvider.listVoices()).resolves.toEqual([]);
  });
});
