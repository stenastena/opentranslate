import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../ipc/channels';
import { WindowBounds } from '../settings';

let popupWindow: BrowserWindow | null = null;

// Issue #159: the popup used to be destroyed and rebuilt from scratch
// (a brand new BrowserWindow + a full HTML/JS/CSS reload into a fresh
// renderer process) on every single hotkey capture — see the old
// `popupWindow?.close()` this replaced. That's real, avoidable work on
// the app's single hottest path, and its cost varies a lot with how warm
// Windows' file-cache/working-set for the app's own files happens to be
// at that moment — fully warm (just used a moment ago) it's barely
// noticeable, but stone cold (first capture after launch, or after a
// long idle stretch where Windows has trimmed/evicted those pages under
// memory pressure) it can run into several seconds, confirmed against
// the project owner's own report of up to ~10s specifically in exactly
// those two situations. Now the window is created once and reused —
// 'close' (the X button, Alt+F4, Escape) just hides it instead of
// destroying it, so every capture after the first one reuses the same
// already-loaded, already-warm renderer process and only pays for
// pushing the new captured text over IPC, not for rebuilding a window.
// Set from main/index.ts's own 'before-quit' handler (not registered
// here directly — this module must stay importable without a real
// Electron runtime for popupWindow.test.ts's pure-function tests, and
// calling any real electron API eagerly at module-load time would break
// that under vitest's plain-Node environment).
let isQuitting = false;
export function setQuitting(value: boolean): void {
  isQuitting = value;
}

// Where the user last moved/resized the popup to. Reused as the anchor for
// the next popup instead of always defaulting back to the cursor position —
// once the user has settled on a spot/size they like, keep opening there.
// Primed from persisted settings at startup (see primeLastBounds) so this
// survives app restarts too, not just captures within one running session.
let lastBounds: WindowBounds | null = null;

// Issue #151: called once at startup (main/index.ts) with whatever bounds
// were persisted from the previous session — a fresh install / anyone who
// has never moved the popup gets null, unchanged first-launch behavior.
export function primeLastBounds(bounds: WindowBounds | null): void {
  lastBounds = bounds;
}

// Fires once per completed move/resize (not continuously — see
// showPopupWindow's use of the 'resized'/'moved' events below) so
// main/index.ts can persist it to settings without hammering disk I/O on
// every intermediate frame of a drag.
let onBoundsSettled: ((bounds: WindowBounds) => void) | null = null;

export function onPopupBoundsSettled(callback: (bounds: WindowBounds) => void): void {
  onBoundsSettled = callback;
}

// Issue #159 follow-up: popup.ts's own `applyAppearance` comment used to
// say settings changes only take effect "the popup is normally closed/
// reopened per capture anyway" — no longer true now that the window (and
// its renderer) persists indefinitely instead of being rebuilt every
// capture. Call this from main/index.ts's settings-updated callback so a
// theme/font/default-provider/etc. change made in Settings still shows up
// on the next capture instead of only after a full app restart. A no-op
// if the popup has never been created yet — nothing to refresh.
export function reloadPopupWindow(): void {
  popupWindow?.webContents.reload();
}

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 360;
const CURSOR_ANCHOR_OFFSET = 12;

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Anchoring the window directly at a point pushed part or all of it
// off-screen when that point was near a screen edge (issue #69 follow-up).
// Clamp against the work area of whichever display the point is on so the
// whole window always stays visible. Pure (workArea passed in rather than
// fetched via Electron's `screen` module internally) so the geometry can
// be unit-tested without mocking Electron — see popupWindow.test.ts.
export function clampToWorkArea(x: number, y: number, width: number, height: number, workArea: WorkArea): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height),
  };
}

// Issue #18: places a *fresh* popup (no remembered position — see
// lastBounds below) so it doesn't sit directly on top of the cursor that
// opened it. Flips to the opposite side of the cursor first when the
// default offset would spill past a work-area edge, falling back to
// clamping only if even the flipped position still doesn't fit (e.g. a
// popup wider/taller than the whole screen). Ported from ahatem/
// QTranslate's FloatingPopupBehavior.positionNearMouse, whose own comment
// states exactly the problem this fixes: plain clamping slides the popup
// back under the cursor, covering the very selection the user just made —
// confirmed by reading the reasoning in that Kotlin source, not guessed.
export function resolveCursorAnchor(cursorX: number, cursorY: number, width: number, height: number, workArea: WorkArea, offset = CURSOR_ANCHOR_OFFSET): { x: number; y: number } {
  let x = cursorX + offset;
  let y = cursorY + offset;
  if (x + width > workArea.x + workArea.width) x = cursorX - width - offset;
  if (y + height > workArea.y + workArea.height) y = cursorY - height - offset;
  return clampToWorkArea(x, y, width, height, workArea);
}

// Issue #134: pure geometry for growing (never shrinking) the popup's
// content height to fit newly revealed content (Show Dictionary) —
// factored out from growPopupHeightToFit the same way clampToWorkArea is
// above, so the capping math is unit-testable without a real Electron
// BrowserWindow. currentY/chromeHeight describe the window's current top
// edge and its fixed (title bar/border) overhead outside the content
// area; together with the work area they determine how far the content
// can grow downward before the window's bottom edge would leave the
// screen. A desiredContentHeight at or below the current height is a
// no-op — something (a shorter dictionary entry) collapsing shouldn't
// visibly snap the window smaller out from under the user.
export function computeGrownContentHeight(
  desiredContentHeight: number,
  currentContentHeight: number,
  currentY: number,
  chromeHeight: number,
  workArea: WorkArea,
): number {
  if (desiredContentHeight <= currentContentHeight) return currentContentHeight;
  const maxContentHeight = workArea.y + workArea.height - currentY - chromeHeight;
  // Clamp the desired growth to whatever room is left before the bottom
  // edge leaves the screen — but never below the current height: if the
  // window is already positioned such that even its current size exceeds
  // that room (maxContentHeight < currentContentHeight), there's nothing
  // to shrink back to here, so leave it exactly as it is.
  return Math.max(currentContentHeight, Math.min(desiredContentHeight, maxContentHeight));
}

// Only the height ever changes — width, x, and y are left exactly as they
// are (setContentSize keeps the window's top-left corner anchored), so the
// window's bottom edge moves down and its width/the translation fields'
// width never do, per issue #134.
export function growPopupHeightToFit(win: BrowserWindow, desiredContentHeight: number): void {
  const [contentWidth, currentContentHeight] = win.getContentSize();
  const bounds = win.getBounds();
  const chromeHeight = bounds.height - currentContentHeight;
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const newContentHeight = computeGrownContentHeight(desiredContentHeight, currentContentHeight, bounds.y, chromeHeight, workArea);
  if (newContentHeight > currentContentHeight) win.setContentSize(contentWidth, newContentHeight);
}

function resolvePopupPosition(bounds: { x: number; y: number } | null, width: number, height: number): { x: number; y: number } {
  if (bounds) {
    return clampToWorkArea(bounds.x, bounds.y, width, height, screen.getDisplayNearestPoint(bounds).workArea);
  }
  const cursor = screen.getCursorScreenPoint();
  return resolveCursorAnchor(cursor.x, cursor.y, width, height, screen.getDisplayNearestPoint(cursor).workArea);
}

// capturedText omitted (undefined) means "just make sure the main window is
// visible" — the tray's/hotkey-with-no-selection's case, which brings an
// already-open popup to front without discarding whatever's in progress
// there. Passing an explicit string (including '') means a fresh capture
// that should replace whatever the popup was showing — handled by pushing
// it over IPC to the existing renderer (see popup.ts's onCapturedText,
// which already fully resets per-capture state) rather than rebuilding
// the window, per #159.
export function showPopupWindow(capturedText?: string): BrowserWindow {
  if (popupWindow) {
    popupWindow.show();
    popupWindow.focus();
    if (capturedText !== undefined) {
      popupWindow.webContents.send(CHANNELS.popupCapturedText, capturedText);
    }
    return popupWindow;
  }

  const width = lastBounds?.width ?? DEFAULT_WIDTH;
  const height = lastBounds?.height ?? DEFAULT_HEIGHT;
  // A remembered manual position/size is just re-clamped in place — there's
  // no cursor context to flip around, and re-anchoring it near whatever the
  // cursor happens to be this time would fight the user's own placement,
  // the exact thing lastBounds exists to avoid. Only a genuinely fresh
  // popup (no lastBounds yet) gets the cursor-flip treatment.
  const { x, y } = resolvePopupPosition(lastBounds, width, height);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: true,
    resizable: true,
    // Per issue #69: the popup must behave like a normal window — it
    // should not float over whatever the user switches to, and losing
    // focus must not close it (only Esc does). alwaysOnTop:true and a
    // close-on-blur handler both actively fought that; removed.
    alwaysOnTop: false,
    // skipTaskbar also removes the window from Alt+Tab on Windows (they
    // share the same WS_EX_TOOLWINDOW/APPWINDOW style bit) — confirmed on
    // the real machine that with it set, the popup could only be found by
    // clicking it with the mouse, with no keyboard way back to it. A real
    // window needs to be Alt+Tab-reachable.
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(join(__dirname, '..', '..', 'renderer', 'popup', 'index.html'));

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[popup]', message);
  });

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send(CHANNELS.popupCapturedText, capturedText ?? '');
  });

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') win.hide();
  });

  // Issue #159: the window persists for the app's whole lifetime now
  // (see the top-of-file comment) — the taskbar close button and Alt+F4
  // both fire 'close', which by default would destroy it; intercepted so
  // they hide it instead, same as Escape. Only a genuine app quit (tray
  // Exit / File > Exit, both app.quit()) is allowed through, via the
  // isQuitting flag set from 'before-quit'.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  const persistBounds = () => {
    lastBounds = win.getBounds();
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // 'resized'/'moved' (Windows-only, matching this app's only target OS)
  // fire once when the operation actually finishes, unlike 'resize'/'move'
  // above which fire continuously through every intermediate frame of a
  // drag — the right granularity for a disk write, so dragging the window
  // doesn't hammer settings.json dozens of times per second.
  const notifyBoundsSettled = () => onBoundsSettled?.(win.getBounds());
  win.on('resized', notifyBoundsSettled);
  win.on('moved', notifyBoundsSettled);

  win.on('closed', () => {
    if (popupWindow === win) popupWindow = null;
  });

  popupWindow = win;
  return win;
}
