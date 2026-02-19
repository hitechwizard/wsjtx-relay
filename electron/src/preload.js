const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Settings API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Theme API
  getTheme: () => ipcRenderer.invoke('get-theme'),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (event, theme) => callback(theme)),

  // Relay control API
  startRelay: () => ipcRenderer.invoke('start-relay'),
  stopRelay: () => ipcRenderer.invoke('stop-relay'),
  getRelayStatus: () => ipcRenderer.invoke('get-relay-status'),

  // Manual QSO logging
  logQso: (qso) => ipcRenderer.invoke('log-qso', qso),

  // QSO persistence API
  saveQso: (qso) => ipcRenderer.invoke('save-qso', qso),
  clearQsos: () => ipcRenderer.invoke('clear-qsos'),
  getQsos: () => ipcRenderer.invoke('get-qsos'),
  updateQsos: (qsos) => ipcRenderer.invoke('update-qsos', qsos),
  updateQso: (index, qso) => ipcRenderer.invoke('update-qso', index, qso),
  deleteQso: (index) => ipcRenderer.invoke('delete-qso', index),
  exportQsosAdif: () => ipcRenderer.invoke('export-qsos-adif'),
  importQsosAdif: () => ipcRenderer.invoke('import-qsos-adif'),
  resendQso: (qso) => ipcRenderer.invoke('resend-qso', qso),
  resendAllQsos: () => ipcRenderer.invoke('resend-all-qsos'),

  // Window control API
  openSettings: () => ipcRenderer.send('open-settings'),
  openQsoEditor: () => ipcRenderer.send('open-qso-editor'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  closeQsoEditor: () => ipcRenderer.send('close-qso-editor'),

  // Events from relay
  onRelayLog: (callback) => ipcRenderer.on('relay-log', (event, msg) => callback(msg)),
  onRelayStatus: (callback) => ipcRenderer.on('relay-status', (event, status) => callback(status)),
  onRelayError: (callback) => ipcRenderer.on('relay-error', (event, msg) => callback(msg)),
  onRelayDecode: (callback) => ipcRenderer.on('relay-decode', (event, msg) => callback(msg)),
  onRelayStatusUpdate: (callback) =>
    ipcRenderer.on('relay-status-update', (event, statusData) => callback(statusData)),
  onRelayQsoLogged: (callback) =>
    ipcRenderer.on('relay-qso-logged', (event, qsoData) => callback(qsoData)),
  onQsoDataRefresh: (callback) => ipcRenderer.on('qso-data-refresh', () => callback()),
  notifyQsoDataChanged: () => ipcRenderer.send('qso-data-changed'),
});
