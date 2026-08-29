import { Menu, MenuItemConstructorOptions } from 'electron';

// Windows with setMenuBarVisibility(false) (Settings, History) never show
// this; it's only ever visible on the popup, which otherwise fell back to
// Electron's unconfigured default (File/Edit/View/Window/Help) — replaced
// here with something that actually reflects the app, including a way to
// reach History/Settings without going through the tray icon.
export function installApplicationMenu(onOpenSettings: () => void, onOpenHistory: () => void): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Settings', click: onOpenSettings },
        { label: 'History', click: onOpenHistory },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
