const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const WSJTXRelay = require('./relay');

let mainWindow;
let settingsWindow;
let relay;

const store = new Store({
  defaults: {
    listenPort: 2237,
    forwards: [],
    theme: 'light',
    windowBounds: { width: 800, height: 600 }
  }
});

function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

  // Send initial theme to window when ready
  mainWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    mainWindow.webContents.send('theme-changed', theme);
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

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    parent: mainWindow,
    modal: true,
    show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../ui/settings.html'));

  // Send initial theme to settings window when ready
  settingsWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    settingsWindow.webContents.send('theme-changed', theme);
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return {
    listenPort: store.get('listenPort'),
    forwards: store.get('forwards'),
    theme: store.get('theme')
  };
});

ipcMain.handle('save-settings', (event, { listenPort, forwards, theme }) => {
  store.set('listenPort', listenPort);
  store.set('forwards', forwards);
  if (theme) {
    store.set('theme', theme);
  }
  
  // Update relay if running
  if (relay && relay.running) {
    relay.updateSettings(listenPort, forwards);
  }
  
  // Notify all windows about theme change
  if (theme) {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('theme-changed', theme);
    });
  }
  
  return { success: true };
});

ipcMain.handle('start-relay', () => {
  if (!relay) {
    const listenPort = store.get('listenPort');
    const forwards = store.get('forwards');
    relay = new WSJTXRelay(listenPort, forwards);

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

    relay.on('qso-logged', (adif) => {
      mainWindow && mainWindow.webContents.send('relay-qso-logged', adif);
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

ipcMain.on('open-settings', createSettingsWindow);

ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
    settingsWindow = null;
  }
});

ipcMain.handle('get-theme', () => {
  return store.get('theme', 'light');
});

app.on('ready', () => {
  createWindow();

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: createSettingsWindow
        },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            if (relay && relay.running) {
              relay.stop();
            }
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ]);

  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
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
