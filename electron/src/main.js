const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const WSJTXRelay = require('./relay');
const { AdiWriter } = require('./adif/AdiWriter');
const AdiReader = require('./adif/AdiReader');

const isMac = process.platform === 'darwin';

let mainWindow;
let settingsWindow;
let qsoEditorWindow;
let relay;
let updateCheckTimer;
let isUpdateCheckInProgress = false;
let isInteractiveUpdateCheck = false;
let isUpdateDownloadInProgress = false;
let availableUpdateInfo = null;
let updateReadyToInstall = false;

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INTERNET_CHECK_TIMEOUT_MS = 3000;
const APP_ICON_PATH = path.join(
  __dirname,
  process.platform === 'win32' ? '../assets/icon.ico' : '../assets/icon.png',
);

function parseVersionSegments(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => {
      const [numericPart] = String(segment).split('-');
      const parsed = Number.parseInt(numericPart, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function isVersionNewer(candidateVersion, currentVersion) {
  const candidate = parseVersionSegments(candidateVersion);
  const current = parseVersionSegments(currentVersion);
  const maxLength = Math.max(candidate.length, current.length);

  for (let index = 0; index < maxLength; index += 1) {
    const candidateSegment = candidate[index] || 0;
    const currentSegment = current[index] || 0;

    if (candidateSegment > currentSegment) {
      return true;
    }

    if (candidateSegment < currentSegment) {
      return false;
    }
  }

  return false;
}

function hasNewerUpdateAvailable() {
  if (!availableUpdateInfo || !availableUpdateInfo.version) {
    return false;
  }

  return isVersionNewer(availableUpdateInfo.version, app.getVersion());
}

const store = new Store({
  defaults: {
    listenPort: 2237,
    forwards: [],
    forwardDelaySeconds: 0.5,
    activityPacketFilters: [
      'Heartbeat',
      'Status',
      'Decode',
      'QSO Logged',
      'Logged ADIF',
      'SYSTEM',
    ],
    theme: 'light',
    windowBounds: { width: 1200, height: 800 },
    settingsWindowBounds: { width: 600, height: 500 },
    qsoEditorWindowBounds: { width: 1000, height: 700 },
    qsos: [],
  },
});

async function hasInternetConnectivity() {
  const connectivityCheck = dns.promises
    .lookup('github.com')
    .then(() => true)
    .catch(() => false);

  const timeoutCheck = new Promise((resolve) => {
    setTimeout(() => resolve(false), INTERNET_CHECK_TIMEOUT_MS);
  });

  return Promise.race([connectivityCheck, timeoutCheck]);
}

function getUpdateBadgeState() {
  if (updateReadyToInstall) {
    return {
      visible: true,
      kind: 'ready',
      label: 'Install Update',
    };
  }

  if (hasNewerUpdateAvailable()) {
    const version = availableUpdateInfo.version ? ` ${availableUpdateInfo.version}` : '';
    return {
      visible: true,
      kind: 'available',
      label: `Update Available${version}`,
    };
  }

  return { visible: false };
}

function sendUpdateBadgeState() {
  if (!mainWindow || !mainWindow.webContents) {
    return;
  }

  mainWindow.webContents.send('update-badge-state', getUpdateBadgeState());
}

async function promptToInstallDownloadedUpdate() {
  if (!mainWindow || !updateReadyToInstall) {
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Install Update',
    message: 'An update has been downloaded and is ready to install.',
    detail: 'Do you want to restart now and install the update?',
    buttons: ['Install & Restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    autoUpdater.quitAndInstall();
  }
}

async function promptToDownloadAvailableUpdate(updateInfo) {
  if (!mainWindow || !updateInfo) {
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Update Available',
    message: `Version ${updateInfo.version} is available.`,
    detail: 'Do you want to download and install it?',
    buttons: ['Download & Install', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response !== 0 || isUpdateDownloadInProgress) {
    return;
  }

  const hasInternet = await hasInternetConnectivity();
  if (!hasInternet) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Download',
      message: 'No internet connection detected. Download skipped.',
      buttons: ['OK'],
    });
    return;
  }

  isUpdateDownloadInProgress = true;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Download Failed',
      message,
      buttons: ['OK'],
    });
  } finally {
    isUpdateDownloadInProgress = false;
  }
}

async function performUpdateAction() {
  if (updateReadyToInstall) {
    await promptToInstallDownloadedUpdate();
    return;
  }

  if (availableUpdateInfo) {
    await promptToDownloadAvailableUpdate(availableUpdateInfo);
    return;
  }

  await checkForAppUpdates({ interactive: true });
}

function setupAutoUpdaterEventHandlers() {
  autoUpdater.on('update-not-available', () => {
    if (!updateReadyToInstall) {
      availableUpdateInfo = null;
      sendUpdateBadgeState();
    }

    if (!isInteractiveUpdateCheck || !mainWindow) {
      isInteractiveUpdateCheck = false;
      return;
    }

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Check for Updates',
      message: `You are on the current version (${app.getVersion()}).`,
      buttons: ['OK'],
    });

    isInteractiveUpdateCheck = false;
  });

  autoUpdater.on('update-available', async (updateInfo) => {
    if (!isVersionNewer(updateInfo?.version, app.getVersion())) {
      availableUpdateInfo = null;
      sendUpdateBadgeState();
      isInteractiveUpdateCheck = false;
      return;
    }

    availableUpdateInfo = updateInfo;
    sendUpdateBadgeState();

    if (!isInteractiveUpdateCheck || !mainWindow) {
      isInteractiveUpdateCheck = false;
      return;
    }

    await promptToDownloadAvailableUpdate(updateInfo);

    isInteractiveUpdateCheck = false;
  });

  autoUpdater.on('update-downloaded', async () => {
    updateReadyToInstall = true;
    sendUpdateBadgeState();
    await promptToInstallDownloadedUpdate();
  });

  autoUpdater.on('error', async (err) => {
    const message = err && err.message ? err.message : String(err);
    console.warn(`Update check failed: ${message}`);

    if (message.includes('latest-mac.yml')) {
      availableUpdateInfo = null;
      sendUpdateBadgeState();
    }

    if (isInteractiveUpdateCheck && mainWindow) {
      const detailMessage = message.includes('latest-mac.yml')
        ? 'This release is missing macOS auto-update metadata (latest-mac.yml). Publish a new release that includes macOS ZIP + DMG artifacts, then try again.'
        : message;
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Check Failed',
        message: detailMessage,
        buttons: ['OK'],
      });
    }

    isInteractiveUpdateCheck = false;
    isUpdateDownloadInProgress = false;
  });
}

async function checkForAppUpdates(options = {}) {
  const { interactive = false } = options;

  if (!app.isPackaged) {
    if (interactive && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Check for Updates',
        message: 'Update checks are only available in packaged builds.',
        buttons: ['OK'],
      });
    }
    return;
  }

  if (isUpdateCheckInProgress) {
    if (interactive && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Check for Updates',
        message: 'An update check is already in progress.',
        buttons: ['OK'],
      });
    }
    return;
  }

  isInteractiveUpdateCheck = interactive;

  const hasInternet = await hasInternetConnectivity();
  if (!hasInternet) {
    if (interactive && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Check for Updates',
        message: 'No internet connection detected. Skipping this check.',
        buttons: ['OK'],
      });
    }
    isInteractiveUpdateCheck = false;
    return;
  }

  isUpdateCheckInProgress = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.warn(`Update check failed: ${message}`);
    if (interactive && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Check Failed',
        message,
        buttons: ['OK'],
      });
    }
    isInteractiveUpdateCheck = false;
  } finally {
    isUpdateCheckInProgress = false;
  }
}

function configureUpdateChecks() {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  setupAutoUpdaterEventHandlers();

  checkForAppUpdates();
  updateCheckTimer = setInterval(() => {
    checkForAppUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
}

function showExamplesHelpStub() {
  if (!mainWindow) {
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Examples',
    message: 'Examples help content is not implemented yet.',
    detail: 'This menu item is a placeholder for future documentation.',
    buttons: ['OK'],
  });
}

function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

  // Send initial theme to window when ready
  mainWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    mainWindow.webContents.send('theme-changed', theme);
    sendUpdateBadgeState();
  });

  // Save window bounds on close
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const bounds = store.get('settingsWindowBounds', { width: 600, height: 500 });

  const windowOptions = {
    width: bounds.width,
    height: bounds.height,
    parent: mainWindow,
    modal: true,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (typeof bounds.x === 'number' && typeof bounds.y === 'number') {
    windowOptions.x = bounds.x;
    windowOptions.y = bounds.y;
  }

  settingsWindow = new BrowserWindow(windowOptions);

  settingsWindow.loadFile(path.join(__dirname, '../ui/settings.html'));

  // Send initial theme to settings window when ready
  settingsWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    settingsWindow.webContents.send('theme-changed', theme);
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.on('close', () => {
    const currentBounds = settingsWindow.getBounds();
    store.set('settingsWindowBounds', currentBounds);
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
}

function createQsoEditorWindow() {
  if (qsoEditorWindow) {
    qsoEditorWindow.focus();
    return;
  }

  const bounds = store.get('qsoEditorWindowBounds', { width: 1000, height: 700 });

  const windowOptions = {
    width: bounds.width,
    height: bounds.height,
    parent: mainWindow,
    modal: true,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (typeof bounds.x === 'number' && typeof bounds.y === 'number') {
    windowOptions.x = bounds.x;
    windowOptions.y = bounds.y;
  }

  qsoEditorWindow = new BrowserWindow(windowOptions);

  qsoEditorWindow.loadFile(path.join(__dirname, '../ui/qso-editor.html'));

  // Send initial theme to QSO editor window when ready
  qsoEditorWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    qsoEditorWindow.webContents.send('theme-changed', theme);
  });

  qsoEditorWindow.on('closed', () => {
    qsoEditorWindow = null;
  });

  qsoEditorWindow.on('close', () => {
    const currentBounds = qsoEditorWindow.getBounds();
    store.set('qsoEditorWindowBounds', currentBounds);
  });

  qsoEditorWindow.once('ready-to-show', () => {
    qsoEditorWindow.show();
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return {
    listenPort: store.get('listenPort'),
    forwards: store.get('forwards'),
    forwardDelaySeconds: store.get('forwardDelaySeconds', 0.5),
    activityPacketFilters: store.get('activityPacketFilters', [
      'Heartbeat',
      'Status',
      'Decode',
      'QSO Logged',
      'Logged ADIF',
      'SYSTEM',
    ]),
    theme: store.get('theme'),
    qsos: store.get('qsos'),
  };
});

ipcMain.handle(
  'save-settings',
  (event, { listenPort, forwards, forwardDelaySeconds, activityPacketFilters, theme }) => {
    store.set('listenPort', listenPort);
    store.set('forwards', forwards);
    if (typeof forwardDelaySeconds === 'number' && Number.isFinite(forwardDelaySeconds)) {
      store.set('forwardDelaySeconds', forwardDelaySeconds);
    }
    if (Array.isArray(activityPacketFilters)) {
      store.set('activityPacketFilters', activityPacketFilters);
    }
    if (theme) {
      store.set('theme', theme);
    }

    // Update relay if running
    if (relay && relay.running) {
      relay.updateSettings(listenPort, forwards, store.get('forwardDelaySeconds', 0.5));
    }

    const updatedSettings = {
      listenPort: store.get('listenPort'),
      forwards: store.get('forwards'),
      forwardDelaySeconds: store.get('forwardDelaySeconds', 0.5),
      activityPacketFilters: store.get('activityPacketFilters', [
        'Heartbeat',
        'Status',
        'Decode',
        'QSO Logged',
        'Logged ADIF',
        'SYSTEM',
      ]),
      theme: store.get('theme', 'light'),
    };

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('settings-changed', updatedSettings);
    });

    // Notify all windows about theme change
    if (theme) {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('theme-changed', theme);
      });
    }

    return { success: true };
  },
);

ipcMain.handle('start-relay', () => {
  if (!relay) {
    const listenPort = store.get('listenPort');
    const forwards = store.get('forwards');
    const forwardDelaySeconds = store.get('forwardDelaySeconds', 0.5);
    relay = new WSJTXRelay(listenPort, forwards, forwardDelaySeconds);

    relay.on('log', (msg) => {
      mainWindow && mainWindow.webContents.send('relay-log', msg);
    });

    relay.on('status', (status) => {
      mainWindow && mainWindow.webContents.send('relay-status', status);
    });

    relay.on('error', (msg) => {
      mainWindow && mainWindow.webContents.send('relay-error', msg);
    });

    relay.on('decode', (msg) => {
      mainWindow && mainWindow.webContents.send('relay-decode', msg);
    });

    relay.on('status-update', (statusData) => {
      mainWindow && mainWindow.webContents.send('relay-status-update', statusData);
    });

    relay.on('qso-logged', (qso) => {
      mainWindow && mainWindow.webContents.send('relay-qso-logged', qso);
    });
  }

  relay.start();
  return { success: true, status: 'running' };
});

ipcMain.handle('stop-relay', () => {
  if (relay) {
    relay.stop();
  }
  return { success: true, status: 'stopped' };
});

ipcMain.handle('get-relay-status', () => {
  return relay ? (relay.running ? 'running' : 'stopped') : 'stopped';
});

ipcMain.handle('log-qso', (event, qso) => {
  if (relay) {
    const packet = relay.createAdifPacket(qso);
    relay.handleMessage(packet, {});

    return { success: true };
  }
  return { success: false, error: 'Relay not running' };
});

ipcMain.handle('save-qso', (event, qso) => {
  const qsos = store.get('qsos', []);
  qsos.push(qso);
  store.set('qsos', qsos);
  return { success: true };
});

ipcMain.handle('clear-qsos', () => {
  store.set('qsos', []);
  return { success: true };
});

ipcMain.handle('get-qsos', () => {
  return store.get('qsos', []);
});

ipcMain.handle('update-qsos', (event, qsos) => {
  store.set('qsos', qsos);
  return { success: true };
});

ipcMain.handle('update-qso', (event, index, qso) => {
  const qsos = store.get('qsos', []);
  if (index >= 0 && index < qsos.length) {
    qsos[index] = qso;
    store.set('qsos', qsos);
    return { success: true };
  }
  return { success: false, error: 'Invalid index' };
});

ipcMain.handle('delete-qso', (event, index) => {
  const qsos = store.get('qsos', []);
  if (index >= 0 && index < qsos.length) {
    qsos.splice(index, 1);
    store.set('qsos', qsos);
    return { success: true };
  }
  return { success: false, error: 'Invalid index' };
});

ipcMain.handle('resend-qso', async (event, qso) => {
  if (relay) {
    try {
      // Ensure relay is started so socket exists
      if (!relay.running) {
        relay.start();
      }
      await relay.resendQsos(qso);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Relay not available' };
});

ipcMain.handle('resend-all-qsos', async () => {
  const qsos = store.get('qsos', []);
  if (relay) {
    try {
      // Ensure relay is started so socket exists
      if (!relay.running) {
        relay.start();
      }
      await relay.resendQsos(qsos);
      return { success: true, count: qsos.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Relay not available' };
});

ipcMain.handle('export-qsos-adif', async () => {
  const qsos = store.get('qsos', []);

  const { filePath } = await dialog.showSaveDialog(qsoEditorWindow, {
    title: 'Export QSOs to ADIF',
    defaultPath: `qsos-${new Date().toISOString().split('T')[0]}.adi`,
    filters: [
      { name: 'ADIF Files', extensions: ['adi', 'adif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (filePath) {
    try {
      const writer = new AdiWriter('wsjtx-relay', '1.0');
      const adifData = writer.writeAll(qsos);
      fs.writeFileSync(filePath, adifData, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'Export cancelled' };
});

ipcMain.handle('import-qsos-adif', async () => {
  const { filePaths } = await dialog.showOpenDialog(qsoEditorWindow, {
    title: 'Import QSOs from ADIF',
    filters: [
      { name: 'ADIF Files', extensions: ['adi', 'adif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (filePaths && filePaths.length > 0) {
    try {
      const fileContent = fs.readFileSync(filePaths[0], 'utf-8');
      const reader = new AdiReader(fileContent);
      const importedQsos = reader.readAll();
      return { success: true, qsos: importedQsos, filePath: filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'Import cancelled' };
});

ipcMain.on('open-settings', createSettingsWindow);

ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
    settingsWindow = null;
  }
});

ipcMain.on('open-qso-editor', createQsoEditorWindow);

ipcMain.on('close-qso-editor', () => {
  if (qsoEditorWindow) {
    qsoEditorWindow.close();
    qsoEditorWindow = null;
  }
});

ipcMain.handle('get-theme', () => {
  return store.get('theme', 'light');
});

ipcMain.on('qso-data-changed', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('qso-data-refresh');
  }
});

ipcMain.handle('perform-update-action', async () => {
  await performUpdateAction();
  return { success: true };
});

app.on('ready', () => {
  createWindow();
  configureUpdateChecks();

  const template = [
    {
      label: isMac ? app.name : 'File',
      submenu: [
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: createSettingsWindow,
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            if (relay && relay.running) {
              relay.stop();
            }
            app.quit();
          },
        },
      ],
    },

    {
      label: 'Window',
      submenu: [
        {
          label: 'QSO Editor',
          accelerator: 'CmdOrCtrl+E',
          click: createQsoEditorWindow,
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },

    ...(!app.isPackaged
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
          click: () => {
            performUpdateAction();
          },
        },
        {
          label: 'Examples',
          click: showExamplesHelpStub,
        },
        ...(!isMac ? [{ type: 'separator' }, { role: 'about' }] : []),
      ],
    },
  ];

  if (isMac) {
    template[0].submenu.unshift({ type: 'separator' });
    template[0].submenu.unshift({ role: 'about' });
  }

  const menu = Menu.buildFromTemplate(template);

  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  if (relay && relay.running) {
    relay.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

process.on('exit', () => {
  if (relay && relay.running) {
    relay.stop();
  }
});
