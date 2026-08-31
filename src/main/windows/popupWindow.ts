import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../ipc/channels';
import { clampOpacity, createSettingsStore } from '../settings';

let popupWindow: BrowserWindow | null = null;

// Where the user last moved/resized the popup to. Reused as the anchor for
// the next popup instead of always defaulting back to the cursor position —
// once the user has settled on a spot/size they like, keep opening there.
let lastBounds: { x: number; y: number; width: number; height: number } | null = null;

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 360;

// Anchoring the window directly at the cursor pushed part or all of it
// off-screen when the selected text was near a screen edge (issue #69
// follow-up). Clamp against the work area of whichever display the anchor
// point is on so the whole window always stays visible.
function clampToWorkArea(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.min(Math.max(x, areaX), areaX + areaWidth - width),
    y: Math.min(Math.max(y, areaY), areaY + areaHeight - height),
  };
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
  const anchor = lastBounds ?? screen.getCursorScreenPoint();
  const { x, y } = clampToWorkArea(anchor.x, anchor.y, width, height);

  // Issue #17: read fresh on every fresh popup (not cached at app startup),
  // so an opacity change in Settings takes effect the next time a capture
  // opens a new popup — same "applies on next open" pattern as every other
  // appearance setting (#116's font size/family). A second SettingsStore
  // instance is fine here: it's a thin, stateless wrapper around reading
  // the same settings.json file, not something that needs to be shared.
  const opacity = clampOpacity(createSettingsStore().load().appearance.opacity);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    opacity,
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
