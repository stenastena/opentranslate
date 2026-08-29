import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

export function createTray(onOpenSettings: () => void, onOpenHistory: () => void): Tray {
  const iconPath = join(__dirname, '..', 'assets', 'tray-icon.png');
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('OpenTranslate');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Settings', click: onOpenSettings },
      { label: 'View History', click: onOpenHistory },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]),
  );
  return tray;
}
