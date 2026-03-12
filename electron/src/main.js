const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const https = require('https');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const WSJTXRelay = require('./relay');
const { AdiWriter } = require('./adif/AdiWriter');
const AdiReader = require('./adif/AdiReader');

const isMac = process.platform === 'darwin';

let mainWindow;
let settingsWindow;
let qsoEditorWindow;
let examplesWindow;
let potaSpotsWindow;
let relay;
let updateCheckTimer;
let isUpdateCheckInProgress = false;
let isInteractiveUpdateCheck = false;
let isUpdateDownloadInProgress = false;
let availableUpdateInfo = null;
let updateReadyToInstall = false;

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INTERNET_CHECK_TIMEOUT_MS = 3000;
const POTA_SPOTS_URL = 'https://api.pota.app/spot/activator';
const POTA_REQUEST_TIMEOUT_MS = 5000;
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
    autoStartRelay: false,
    usePotaSpotMap: false,
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
    potaSpotsWindowBounds: { width: 1400, height: 700 },
    potaSpotsFilters: { modeFilter: '', bandFilter: '', regionFilter: '' },
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

function logPotaRequestFailure(message) {
  const detail = String(message || 'Unknown error').trim();
  const logMessage = `POTA request failed: ${detail}`;
  console.warn(logMessage);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('relay-log', logMessage);
  }
}

function fetchPotaSpots() {
  return new Promise((resolve, reject) => {
    const request = https.get(POTA_SPOTS_URL, (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            if (response.statusCode !== 200) {
              reject(new Error(`POTA spots request failed with status ${response.statusCode}`));
              return;
            }

            const payload = Buffer.concat(chunks).toString('utf8');
            const parsed = JSON.parse(payload);
            resolve(Array.isArray(parsed) ? parsed : []);
          } catch (error) {
            reject(error);
          }
        });
      });

    request.setTimeout(POTA_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`timeout after ${POTA_REQUEST_TIMEOUT_MS}ms`));
    });

    request.on('error', reject);
  });
}

function enrichQsoWithPotaSpot(qso, spots) {
  const nextQso = { ...(qso || {}) };
  const dxCall = String(nextQso.dx_call || nextQso.dxCall || nextQso.call || '')
    .toUpperCase()
    .trim();

  if (!dxCall || !Array.isArray(spots) || spots.length === 0) {
    return nextQso;
  }

  const spotMatch = spots.find((spot) => String(spot?.activator || '').toUpperCase().trim() === dxCall);
  if (!spotMatch) {
    return nextQso;
  }

  const existingGrid = String(nextQso.dxGrid || nextQso.gridsquare || '').trim();
  const spotGrid = String(spotMatch.grid4 || '').toUpperCase().trim();
  if (!existingGrid && spotGrid) {
    nextQso.gridsquare = spotGrid;
  }

  nextQso.sig_info = String(spotMatch.reference || '').toUpperCase().trim();
  nextQso.sig = 'POTA';
  return nextQso;
}

async function maybeEnrichQsoFromPotaSpotMap(qso) {
  if (!store.get('usePotaSpotMap', false)) {
    return qso;
  }

  try {
    const spots = await fetchPotaSpots();
    return enrichQsoWithPotaSpot(qso, spots);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    logPotaRequestFailure(message);
    return qso;
  }
}

function bringWindowToFront(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }

  if (!targetWindow.isVisible()) {
    targetWindow.show();
  }

  targetWindow.moveTop();
  targetWindow.focus();
}

function createExamplesWindow() {
  if (examplesWindow) {
    bringWindowToFront(examplesWindow);
    return;
  }

  examplesWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  examplesWindow.loadFile(path.join(__dirname, '../ui/example.html'));

  examplesWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    examplesWindow.webContents.send('theme-changed', theme);
  });

  examplesWindow.on('closed', () => {
    examplesWindow = null;
  });

  examplesWindow.once('ready-to-show', () => {
    examplesWindow.show();
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
    bringWindowToFront(settingsWindow);
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
    bringWindowToFront(qsoEditorWindow);
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

function createPotaSpotsWindow() {
  if (potaSpotsWindow) {
    bringWindowToFront(potaSpotsWindow);
    return;
  }

  const bounds = store.get('potaSpotsWindowBounds', { width: 1400, height: 700 });

  const windowOptions = {
    width: bounds.width,
    height: bounds.height,
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

  potaSpotsWindow = new BrowserWindow(windowOptions);

  potaSpotsWindow.loadFile(path.join(__dirname, '../ui/pota-spots.html'));

  // Send initial theme to POTA Spots window when ready
  potaSpotsWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    potaSpotsWindow.webContents.send('theme-changed', theme);
  });

  potaSpotsWindow.on('closed', () => {
    potaSpotsWindow = null;
  });

  potaSpotsWindow.on('close', () => {
    const currentBounds = potaSpotsWindow.getBounds();
    store.set('potaSpotsWindowBounds', currentBounds);
  });

  potaSpotsWindow.once('ready-to-show', () => {
    potaSpotsWindow.show();
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return {
    listenPort: store.get('listenPort'),
    forwards: store.get('forwards'),
    autoStartRelay: store.get('autoStartRelay', false),
    usePotaSpotMap: store.get('usePotaSpotMap', false),
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

ipcMain.handle('validate-forward-host', async (event, host) => {
  const normalizedHost = String(host || '').trim();

  if (!normalizedHost) {
    return { valid: false, error: 'Host is required' };
  }

  try {
    const results = await dns.promises.lookup(normalizedHost, {
      family: 4,
      all: true,
      verbatim: true,
    });

    if (!Array.isArray(results) || results.length === 0) {
      return { valid: false, error: 'Host did not resolve to an IPv4 address' };
    }

    return {
      valid: true,
      addresses: results.map((entry) => entry.address).filter(Boolean),
    };
  } catch (error) {
    return {
      valid: false,
      error: error && error.message ? error.message : 'Host lookup failed',
    };
  }
});

ipcMain.handle(
  'save-settings',
  (
    event,
    { listenPort, forwards, autoStartRelay, usePotaSpotMap, forwardDelaySeconds, activityPacketFilters, theme },
  ) => {
    store.set('listenPort', listenPort);
    store.set('forwards', forwards);
    if (typeof autoStartRelay === 'boolean') {
      store.set('autoStartRelay', autoStartRelay);
    }
    if (typeof usePotaSpotMap === 'boolean') {
      store.set('usePotaSpotMap', usePotaSpotMap);
    }
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
      autoStartRelay: store.get('autoStartRelay', false),
      usePotaSpotMap: store.get('usePotaSpotMap', false),
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

ipcMain.handle('save-qso', async (event, qso) => {
  const enrichedQso = await maybeEnrichQsoFromPotaSpotMap(qso);
  const qsos = store.get('qsos', []);
  qsos.push(enrichedQso);
  store.set('qsos', qsos);
  return { success: true, qso: enrichedQso };
});

ipcMain.handle('clear-qsos', () => {
  store.set('qsos', []);
  return { success: true };
});

ipcMain.handle('get-qsos', () => {
  return store.get('qsos', []);
});

ipcMain.handle('update-qsos', async (event, qsos) => {
  store.set('qsos', qsos);
  return { success: true };
});

ipcMain.handle('update-qso', async (event, index, qso) => {
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

ipcMain.on('open-pota-spots', createPotaSpotsWindow);

ipcMain.on('close-pota-spots', () => {
  if (potaSpotsWindow) {
    potaSpotsWindow.close();
    potaSpotsWindow = null;
  }
});

ipcMain.handle('fetch-pota-spots', async () => {
  try {
    const spots = await fetchPotaSpots();
    return { success: true, spots };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { success: false, error: message };
  }
});

ipcMain.handle('get-pota-spots-filters', () => {
  return store.get('potaSpotsFilters', { modeFilter: '', bandFilter: '', regionFilter: '' });
});

ipcMain.handle('save-pota-spots-filters', (event, filters) => {
  const nextFilters = {
    modeFilter: String(filters?.modeFilter || ''),
    bandFilter: String(filters?.bandFilter || ''),
    regionFilter: String(filters?.regionFilter || ''),
  };
  store.set('potaSpotsFilters', nextFilters);
  return { success: true };
});

ipcMain.handle('select-pota-spot', async (event, spot) => {
  if (!mainWindow || !mainWindow.webContents) {
    return { success: false, error: 'Main window is not available' };
  }

  mainWindow.webContents.send('pota-spot-selected', spot || {});
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();

  return { success: true };
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

  if (store.get('autoStartRelay', false)) {
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
  }

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
      label: 'Window',
      submenu: [
        {
          label: 'QSO Editor',
          accelerator: 'CmdOrCtrl+E',
          click: createQsoEditorWindow,
        },
        {
          label: 'POTA Spots',
          accelerator: 'CmdOrCtrl+P',
          click: createPotaSpotsWindow,
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
          click: createExamplesWindow,
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
    return;
  }

  bringWindowToFront(mainWindow);
});

process.on('exit', () => {
  if (relay && relay.running) {
    relay.stop();
  }
});
