import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../ipc/channels';

let popupWindow: BrowserWindow | null = null;

// Where the user last moved/resized the popup to. Reused as the anchor for
// the next popup instead of always defaulting back to the cursor position —
// once the user has settled on a spot/size they like, keep opening there.
let lastBounds: { x: number; y: number; width: number; height: number } | null = null;

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

function resolvePopupPosition(bounds: { x: number; y: number } | null, width: number, height: number): { x: number; y: number } {
  if (bounds) {
    return clampToWorkArea(bounds.x, bounds.y, width, height, screen.getDisplayNearestPoint(bounds).workArea);
  }
  const cursor = screen.getCursorScreenPoint();
  return resolveCursorAnchor(cursor.x, cursor.y, width, height, screen.getDisplayNearestPoint(cursor).workArea);
}

// capturedText omitted (undefined) means "just make sure the main window is
// visible" — the tray's/hotkey-with-no-selection's case — which brings an
// already-open popup to front without discarding whatever's in progress
// there, rather than always destroying and recreating it. Passing an
// explicit string (including '') means a fresh capture that should replace
// whatever the popup was showing.
export function showPopupWindow(capturedText?: string): BrowserWindow {
  if (popupWindow && capturedText === undefined) {
    popupWindow.show();
    popupWindow.focus();
    return popupWindow;
  }
  popupWindow?.close();

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
    if (input.key === 'Escape') win.close();
  });

  const persistBounds = () => {
    lastBounds = win.getBounds();
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  win.on('closed', () => {
    if (popupWindow === win) popupWindow = null;
  });

  popupWindow = win;
  return win;
}
