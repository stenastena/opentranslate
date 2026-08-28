import { keyboard, Key } from '@nut-tree-fork/nut-js';
import { KeyEmulatorLike } from './textCapture';

export const nutJsKeyEmulator: KeyEmulatorLike = {
  async pressCtrlC() {
    await keyboard.pressKey(Key.LeftControl, Key.C);
    await keyboard.releaseKey(Key.LeftControl, Key.C);
  },
};
