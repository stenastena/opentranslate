import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const { __resetShellResolutionForTests, systemTtsProvider } = await import('./systemProvider');

type ExecFileCallback = (error: Error | null, stdout?: string) => void;
type ProbeCallback = (error: Error | null) => void;

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { kill: () => void };
  child.kill = vi.fn();
  return child;
}

// The pwsh.exe availability probe (issue #103) — always the first execFile
// call any test triggers. Defaulted to "available" in beforeEach so most
// tests can just focus on the actual script call; the fallback path gets
// its own dedicated tests below.
function mockShellProbe(available: boolean) {
  execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: ProbeCallback) => {
    cb(available ? null : new Error('pwsh.exe not found'));
    return fakeChild();
  });
}

describe('systemTtsProvider', () => {
  beforeEach(() => {
    __resetShellResolutionForTests();
    mockShellProbe(true);
  });

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

    expect(execFileMock).toHaveBeenCalledTimes(2); // probe + the actual script
    const [cmd, args] = execFileMock.mock.calls[1];
    expect(cmd).toBe('pwsh.exe');
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
    // Real Speak-then-Stop clicks always have a meaningful time gap; this
    // just lets the pwsh.exe-availability probe's own microtask settle so
    // `current` is actually assigned before stop() checks it — the probe
    // being awaited before the real script call is exactly what issue
    // #103 added.
    await Promise.resolve();
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

  describe('shell resolution (#103)', () => {
    it('uses pwsh.exe for the actual script when the probe succeeds', async () => {
      // beforeEach already mocked a successful probe; just need the
      // follow-up script call handled.
      execFileMock.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
        cb(null, '[]');
        return fakeChild();
      });

      await systemTtsProvider.listVoices();

      const [probeCmd] = execFileMock.mock.calls[0];
      const [scriptCmd] = execFileMock.mock.calls[1];
      expect(probeCmd).toBe('pwsh.exe');
      expect(scriptCmd).toBe('pwsh.exe');
    });

    it('falls back to powershell.exe when pwsh.exe is not installed', async () => {
      execFileMock.mockReset();
      mockShellProbe(false);
      execFileMock.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
        cb(null, '[]');
        return fakeChild();
      });

      await systemTtsProvider.listVoices();

      const [scriptCmd] = execFileMock.mock.calls[1];
      expect(scriptCmd).toBe('powershell.exe');
    });

    it('only probes for pwsh.exe once, reusing the resolved shell for subsequent calls', async () => {
      execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
        cb(null, '[]');
        return fakeChild();
      });

      await systemTtsProvider.listVoices();
      await systemTtsProvider.listVoices();

      // 1 probe + 2 script calls — the probe (mockImplementationOnce from
      // beforeEach) never fires again on the second listVoices() call.
      expect(execFileMock).toHaveBeenCalledTimes(3);
      expect(execFileMock.mock.calls[0][0]).toBe('pwsh.exe');
      expect(execFileMock.mock.calls[1][0]).toBe('pwsh.exe');
      expect(execFileMock.mock.calls[2][0]).toBe('pwsh.exe');
    });
  });
});
