import { describe, expect, it, vi } from 'vitest';
import { captureSelectedText, ClipboardLike, KeyEmulatorLike } from './textCapture';

function fakeClipboard(initialText: string): ClipboardLike & { current: string } {
  return {
    current: initialText,
    readText() {
      return this.current;
    },
    writeText(text: string) {
      this.current = text;
    },
  };
}

function fakeKeyEmulator(onPress: () => void): KeyEmulatorLike {
  return {
    async pressCtrlC() {
      onPress();
    },
  };
}

describe('captureSelectedText', () => {
  it('returns the text that appeared on the clipboard after emulating Ctrl+C', async () => {
    const clipboard = fakeClipboard('previous clipboard contents');
    const keyEmulator = fakeKeyEmulator(() => {
      clipboard.writeText('the selected text');
    });

    const result = await captureSelectedText(clipboard, keyEmulator, 0);

    expect(result).toBe('the selected text');
  });

  it('restores the original clipboard contents after capturing', async () => {
    const clipboard = fakeClipboard('original clipboard contents');
    const keyEmulator = fakeKeyEmulator(() => {
      clipboard.writeText('captured text');
    });

    await captureSelectedText(clipboard, keyEmulator, 0);

    expect(clipboard.current).toBe('original clipboard contents');
  });

  it('returns an empty string, and still restores the clipboard, when nothing was selected', async () => {
    const clipboard = fakeClipboard('original clipboard contents');
    const keyEmulator = fakeKeyEmulator(() => {
      // Nothing gets copied: no selection under the cursor.
    });

    const result = await captureSelectedText(clipboard, keyEmulator, 0);

    expect(result).toBe('');
    expect(clipboard.current).toBe('original clipboard contents');
  });

  it('clears the clipboard before pressing Ctrl+C so a stale value cannot be mistaken for a fresh capture', async () => {
    const clipboard = fakeClipboard('stale value');
    const seenDuringPress: string[] = [];
    const keyEmulator = fakeKeyEmulator(() => {
      seenDuringPress.push(clipboard.current);
    });

    await captureSelectedText(clipboard, keyEmulator, 0);

    expect(seenDuringPress).toEqual(['']);
  });

  it('polls for the clipboard to update when the OS applies the copy after pressCtrlC resolves', async () => {
    const clipboard = fakeClipboard('original clipboard contents');
    const keyEmulator = fakeKeyEmulator(() => {
      setTimeout(() => clipboard.writeText('arrived late'), 30);
    });

    const result = await captureSelectedText(clipboard, keyEmulator, 200, 10);

    expect(result).toBe('arrived late');
  });

  it('gives up and returns empty once the timeout elapses with nothing on the clipboard', async () => {
    const clipboard = fakeClipboard('original clipboard contents');
    const keyEmulator = fakeKeyEmulator(() => {
      // Never writes anything — simulates a selection that never arrives.
    });

    const result = await captureSelectedText(clipboard, keyEmulator, 30, 10);

    expect(result).toBe('');
  });

  it('restores the clipboard even if the key emulator throws', async () => {
    const clipboard = fakeClipboard('original clipboard contents');
    const keyEmulator: KeyEmulatorLike = {
      pressCtrlC: vi.fn().mockRejectedValue(new Error('input device unavailable')),
    };

    await expect(captureSelectedText(clipboard, keyEmulator, 0)).rejects.toThrow('input device unavailable');
    expect(clipboard.current).toBe('original clipboard contents');
  });
});
