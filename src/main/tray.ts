import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

// Settings and History are already reachable from the popup's own File
// menu (menu.ts) — the tray's job is just getting to that main window in
// the first place, plus quitting. A left-click opens it directly (no need
// to open the context menu first); the context menu covers the same
// action plus Exit for anyone used to right-clicking tray icons.
export function createTray(onOpenMain: () => void): Tray {
  const iconPath = join(__dirname, '..', 'assets', 'tray-icon.png');
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('OpenTranslate');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open OpenTranslate', click: onOpenMain },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]),
  );
  tray.on('click', onOpenMain);
  return tray;
}
