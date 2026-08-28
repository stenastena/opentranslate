export interface ClipboardLike {
  readText(): string;
  writeText(text: string): void;
}

export interface KeyEmulatorLike {
  pressCtrlC(): Promise<void>;
}

const CAPTURE_SETTLE_MS = 150;

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
 */
export async function captureSelectedText(
  clipboard: ClipboardLike,
  keyEmulator: KeyEmulatorLike,
  settleMs = CAPTURE_SETTLE_MS,
): Promise<string> {
  const previousClipboardText = clipboard.readText();
  clipboard.writeText('');

  try {
    await keyEmulator.pressCtrlC();
    await delay(settleMs);
    return clipboard.readText();
  } finally {
    clipboard.writeText(previousClipboardText);
  }
}
