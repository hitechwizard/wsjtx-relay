function buildApplicationMenuTemplate({
  isMac,
  appName,
  isPackaged,
  onOpenPreferences,
  onExit,
  onOpenQsoEditor,
  onOpenPotaSpots,
  onOpenDxSummitSpots,
  onCheckForUpdates,
  onOpenExamples,
}) {
  const template = [
    {
      label: isMac ? appName : 'File',
      submenu: [
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: onOpenPreferences,
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: onExit,
        },
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
        ...(isMac ? [{ role: 'pasteAndMatchStyle' }] : []),
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },

    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    {
      label: 'Window',
      submenu: [
        {
          label: 'QSO Editor',
          accelerator: 'CmdOrCtrl+E',
          click: onOpenQsoEditor,
        },
        {
          label: 'POTA Spots',
          accelerator: 'CmdOrCtrl+P',
          click: onOpenPotaSpots,
        },
        {
          label: 'DX Summit Spots',
          accelerator: 'CmdOrCtrl+D',
          click: onOpenDxSummitSpots,
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },

    ...(!isPackaged
      ? [
          {
            label: 'DevTools',
            submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
          },
        ]
      : []),

    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: onCheckForUpdates,
        },
        {
          label: 'Examples',
          click: onOpenExamples,
        },
        ...(!isMac ? [{ type: 'separator' }, { role: 'about' }] : []),
      ],
    },
  ];

  if (isMac) {
    template[0].submenu.unshift({ type: 'separator' });
    template[0].submenu.unshift({ role: 'about' });
  }

  return template;
}

module.exports = {
  buildApplicationMenuTemplate,
};
