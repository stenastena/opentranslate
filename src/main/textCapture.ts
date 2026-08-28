export interface ClipboardLike {
  readText(): string;
  writeText(text: string): void;
}

export interface KeyEmulatorLike {
  pressCtrlC(): Promise<void>;
}

const CAPTURE_TIMEOUT_MS = 500;
const CAPTURE_POLL_INTERVAL_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Captures whatever text is currently selected in the foreground window by
 * emulating Ctrl+C and reading the clipboard, then restores the clipboard's
 * original contents so this never clobbers the user's own copy/paste
 * history. Takes its dependencies as parameters (rather than importing
 * Electron's clipboard / nut-js directly) so the restore behavior can be
 * unit-tested without a real OS clipboard or input device.
 *
 * Polls the clipboard instead of waiting a single fixed delay: how long
 * Windows takes to update the clipboard after a synthetic Ctrl+C varies
 * (observed anywhere from under 50ms up to a few hundred ms), and a fixed
 * wait that's too short reads back the pre-clear empty string and reports
 * "nothing was selected" even though a selection existed.
 */
export async function captureSelectedText(
  clipboard: ClipboardLike,
  keyEmulator: KeyEmulatorLike,
  timeoutMs = CAPTURE_TIMEOUT_MS,
  pollIntervalMs = CAPTURE_POLL_INTERVAL_MS,
): Promise<string> {
  const previousClipboardText = clipboard.readText();
  clipboard.writeText('');

  try {
    await keyEmulator.pressCtrlC();

    const deadline = Date.now() + timeoutMs;
    let capturedText = clipboard.readText();
    while (!capturedText && Date.now() < deadline) {
      await delay(pollIntervalMs);
      capturedText = clipboard.readText();
    }
    return capturedText;
  } finally {
    clipboard.writeText(previousClipboardText);
  }
}
