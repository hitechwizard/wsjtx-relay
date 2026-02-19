const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const WSJTXRelay = require('./relay');
const { AdiWriter } = require('./adif/AdiWriter');
const AdiReader = require('./adif/AdiReader');

const { WsjtxUdpParser } = require('./WsjtxUdpParser');

let mainWindow;
let settingsWindow;
let qsoEditorWindow;
let relay;

const store = new Store({
  defaults: {
    listenPort: 2237,
    forwards: [],
    theme: 'light',
    windowBounds: { width: 1200, height: 800 },
    qsos: []
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

function createQsoEditorWindow() {
  if (qsoEditorWindow) {
    qsoEditorWindow.focus();
    return;
  }

  qsoEditorWindow = new BrowserWindow({
    width: 1000,
    height: 700,
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

  qsoEditorWindow.loadFile(path.join(__dirname, '../ui/qso-editor.html'));

  // Send initial theme to QSO editor window when ready
  qsoEditorWindow.webContents.on('did-finish-load', () => {
    const theme = store.get('theme', 'light');
    qsoEditorWindow.webContents.send('theme-changed', theme);
  });

  qsoEditorWindow.on('closed', () => {
    qsoEditorWindow = null;
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
    theme: store.get('theme'),
    qsos: store.get('qsos')
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
    // This is where we create a WSJT-X Type 12 Packet and send it to all the forwards
    const adiWriter = new AdiWriter('WSJT-X Relay', '1.0.0')
    adiWriter.writeContact(qso);
    const adif = adiWriter.getData();
    const magicBytes = Buffer.from([0xAD, 0xBC, 0xCB, 0xDA]);
    const version = Buffer.from([0x00, 0x00, 0x00, 0x02]);
    const type = Buffer.from([0x00, 0x00, 0x00, 0x0C]); // 12 -> ADIF
    const id = Buffer.concat([Buffer.from([ 0x00, 0x00, 0x00, 0x06]), Buffer.from('WSJT-X')]);
    const adif_length = Buffer.alloc(4);
    adif_length.writeUint32BE(adif.length);
    const adif_buffer = Buffer.from(adif);
    const packet = Buffer.concat([magicBytes, version, type, id, adif_length, adif_buffer]);
    // packet is ready to go.... SEND IT!
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

ipcMain.handle('export-qsos-adif', async (event) => {
  const qsos = store.get('qsos', []);
  
  const { filePath } = await dialog.showSaveDialog(qsoEditorWindow, {
    title: 'Export QSOs to ADIF',
    defaultPath: `qsos-${new Date().toISOString().split('T')[0]}.adi`,
    filters: [
      { name: 'ADIF Files', extensions: ['adi', 'adif'] },
      { name: 'All Files', extensions: ['*'] }
    ]
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

ipcMain.handle('import-qsos-adif', async (event) => {
  const { filePaths } = await dialog.showOpenDialog(qsoEditorWindow, {
    title: 'Import QSOs from ADIF',
    filters: [
      { name: 'ADIF Files', extensions: ['adi', 'adif'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
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
          label: 'QSO Editor',
          accelerator: 'CmdOrCtrl+E',
          click: createQsoEditorWindow
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
