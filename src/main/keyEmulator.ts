import koffi from 'koffi';
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

// Ctrl+C is emulated via a raw Win32 SendInput call using hardware scan
// codes (KEYEVENTF_SCANCODE), instead of @nut-tree-fork/nut-js's
// virtual-key-based key press. nut-js was found to reliably stop
// producing any clipboard change after a Windows input-language switch
// (RU<->EN, triggered either via Ctrl+Shift or the taskbar language
// indicator) — confirmed on the real dev machine to be independent of
// which physical modifier is involved (mouse-driven layout switches
// broke it too), to persist across restarting the whole Electron
// process, and to leave no stuck modifier at the OS level
// (GetAsyncKeyState) — so it isn't fixable by releasing modifiers first
// (tried) and isn't a nut-js-level or app-level state bug. Sending raw
// hardware scan codes bypasses whatever virtual-key/layout translation
// nut-js's native module (libnut-win32) does internally, and is the
// standard technique other Windows automation tools use to stay
// layout-independent (see nut-tree/nut.js#157, #264 for related
// modifier-key-release bugs in the same library on Windows).
const user32 = koffi.load('user32.dll');
const SendInput = user32.func('uint32_t SendInput(uint32_t nInputs, void *pInputs, int cbSize)');

const INPUT_KEYBOARD = 1;
const KEYEVENTF_SCANCODE = 0x0008;
const KEYEVENTF_KEYUP = 0x0002;

// Standard PC/AT hardware scan codes (Set 1) — layout-independent.
const SCANCODE_LEFT_CONTROL = 0x1d;
const SCANCODE_C = 0x2e;

// sizeof(INPUT) on 64-bit Windows: a 4-byte `type` DWORD, padded to an
// 8-byte boundary for the union that follows (the union's largest member,
// MOUSEINPUT, contains an 8-byte-aligned ULONG_PTR), for a total of 40
// bytes. Only the KEYBDINPUT fields we need are populated; the rest of
// each 40-byte slot is left zeroed padding.
const INPUT_SIZE = 40;

function writeKeyboardInput(buffer: Buffer, offset: number, scanCode: number, keyUp: boolean): void {
  buffer.writeUInt32LE(INPUT_KEYBOARD, offset); // type
  buffer.writeUInt16LE(0, offset + 8); // wVk (unused — scan-code mode)
  buffer.writeUInt16LE(scanCode, offset + 10); // wScan
  buffer.writeUInt32LE(KEYEVENTF_SCANCODE | (keyUp ? KEYEVENTF_KEYUP : 0), offset + 12); // dwFlags
  buffer.writeUInt32LE(0, offset + 16); // time
  buffer.writeBigUInt64LE(0n, offset + 24); // dwExtraInfo
}

export const nutJsKeyEmulator: KeyEmulatorLike = {
  async pressCtrlC() {
    await delay(PRE_PRESS_DELAY_MS);

    const start = Date.now();
    try {
      const inputs = Buffer.alloc(INPUT_SIZE * 4);
      writeKeyboardInput(inputs, INPUT_SIZE * 0, SCANCODE_LEFT_CONTROL, false);
      writeKeyboardInput(inputs, INPUT_SIZE * 1, SCANCODE_C, false);
      writeKeyboardInput(inputs, INPUT_SIZE * 2, SCANCODE_C, true);
      writeKeyboardInput(inputs, INPUT_SIZE * 3, SCANCODE_LEFT_CONTROL, true);

      const sent = SendInput(4, inputs, INPUT_SIZE);
      if (sent !== 4) {
        throw new Error(`SendInput only accepted ${sent}/4 events (GetLastError not surfaced by koffi)`);
      }
      console.log(`[keyEmulator] Ctrl+C emulated in ${Date.now() - start}ms`);
    } catch (error) {
      console.error(`[keyEmulator] failed to emulate Ctrl+C after ${Date.now() - start}ms:`, error);
      throw error;
    }
  },
};
