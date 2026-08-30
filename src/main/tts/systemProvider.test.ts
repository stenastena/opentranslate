import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const { systemTtsProvider } = await import('./systemProvider');

type ExecFileCallback = (error: Error | null, stdout?: string) => void;

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { kill: () => void };
  child.kill = vi.fn();
  return child;
}

describe('systemTtsProvider', () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it('passes text, language and voice name through environment variables, never the script string', async () => {
    const maliciousText = "hello'; Remove-Item C:\\ -Recurse -Force #";
    execFileMock.mockImplementation((_cmd: string, _args: string[], opts: { env: Record<string, string> }, cb: ExecFileCallback) => {
      expect(opts.env.OPENTRANSLATE_TTS_TEXT).toBe(maliciousText);
      expect(opts.env.OPENTRANSLATE_TTS_LANG).toBe('de');
      expect(opts.env.OPENTRANSLATE_TTS_VOICE).toBe("Evil'; Remove-Item C:\\ #");
      cb(null);
      return fakeChild();
    });

    await systemTtsProvider.speak(maliciousText, 'de', "Evil'; Remove-Item C:\\ #");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe('powershell.exe');
    expect(args).toContain('-Command');
    expect(args[args.length - 1]).not.toContain('Remove-Item');
  });

  it('does nothing for blank text', async () => {
    await systemTtsProvider.speak('   ', 'de');
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('omits the language filter and voice override when neither is given', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], opts: { env: Record<string, string> }, cb: ExecFileCallback) => {
      expect(opts.env.OPENTRANSLATE_TTS_LANG).toBe('');
      expect(opts.env.OPENTRANSLATE_TTS_VOICE).toBe('');
      cb(null);
      return fakeChild();
    });

    await systemTtsProvider.speak('hello');
  });

  it('stop() kills the in-flight process without rejecting the pending speak() call', async () => {
    let capturedCb: ExecFileCallback | undefined;
    const child = fakeChild();
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      capturedCb = cb;
      return child;
    });

    const speakPromise = systemTtsProvider.speak('hello', 'en');
    await systemTtsProvider.stop();
    expect(child.kill).toHaveBeenCalled();
    capturedCb?.(new Error('killed'));

    await expect(speakPromise).resolves.toBeUndefined();
  });

  it('a real failure (not from stop()) rejects speak()', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(new Error('powershell not found'));
      return fakeChild();
    });

    await expect(systemTtsProvider.speak('hello', 'en')).rejects.toThrow('powershell not found');
  });

  it('isHealthy returns false when the installed-voices check fails', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(new Error('exit code 1'));
      return fakeChild();
    });

    await expect(systemTtsProvider.isHealthy()).resolves.toBe(false);
  });

  it('isHealthy returns true when the check succeeds', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null);
      return fakeChild();
    });

    await expect(systemTtsProvider.isHealthy()).resolves.toBe(true);
  });

  it('listVoices parses a multi-voice JSON array and lowercases langCode', async () => {
    const json = JSON.stringify([
      { Name: 'Microsoft Hazel Desktop', Locale: 'en-GB', LangCode: 'en', Description: 'Hazel' },
      { Name: 'Microsoft Hedda Desktop', Locale: 'de-DE', LangCode: 'DE', Description: 'Hedda' },
    ]);
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, json);
      return fakeChild();
    });

    await expect(systemTtsProvider.listVoices()).resolves.toEqual([
      { name: 'Microsoft Hazel Desktop', locale: 'en-GB', langCode: 'en', description: 'Hazel' },
      { name: 'Microsoft Hedda Desktop', locale: 'de-DE', langCode: 'de', description: 'Hedda' },
    ]);
  });

  it('listVoices wraps a single-voice JSON object (Windows PowerShell ConvertTo-Json quirk) into an array', async () => {
    const json = JSON.stringify({ Name: 'Microsoft David Desktop', Locale: 'en-US', LangCode: 'en', Description: 'David' });
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, json);
      return fakeChild();
    });

    await expect(systemTtsProvider.listVoices()).resolves.toEqual([{ name: 'Microsoft David Desktop', locale: 'en-US', langCode: 'en', description: 'David' }]);
  });

  it('listVoices returns an empty array when there are no installed voices', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, '');
      return fakeChild();
    });

    await expect(systemTtsProvider.listVoices()).resolves.toEqual([]);
  });
});
