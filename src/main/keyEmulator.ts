import { keyboard, Key } from '@nut-tree-fork/nut-js';
import { KeyEmulatorLike } from './textCapture';

// Give the user's physical fingers time to fully release the global
// hotkey's own keys (which likely include Ctrl) before we simulate a
// fresh Ctrl+C. Sending a synthetic Ctrl-down while the real Ctrl key is
// still physically held produces an inconsistent modifier state and has
// been observed to silently fail to copy anything.
const PRE_PRESS_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const nutJsKeyEmulator: KeyEmulatorLike = {
  async pressCtrlC() {
    await delay(PRE_PRESS_DELAY_MS);

    const start = Date.now();
    try {
      await keyboard.pressKey(Key.LeftControl, Key.C);
      await keyboard.releaseKey(Key.LeftControl, Key.C);
      console.log(`[keyEmulator] Ctrl+C emulated in ${Date.now() - start}ms`);
    } catch (error) {
      console.error(`[keyEmulator] failed to emulate Ctrl+C after ${Date.now() - start}ms:`, error);
      throw error;
    }
  },
};
