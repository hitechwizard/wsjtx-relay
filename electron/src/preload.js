const { contextBridge, ipcRenderer } = require('electron');

function createIpcSubscription(channel, transform = (event, payload) => payload) {
  return (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (event, ...args) => {
      callback(transform(event, ...args));
    };

    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

const onThemeChanged = createIpcSubscription('theme-changed', (event, theme) => theme);
const onRelayLog = createIpcSubscription('relay-log', (event, msg) => msg);
const onRelayStatus = createIpcSubscription('relay-status', (event, status) => status);
const onRelayError = createIpcSubscription('relay-error', (event, msg) => msg);
const onRelayDecode = createIpcSubscription('relay-decode', (event, msg) => msg);
const onRelayDecodePacket = createIpcSubscription('relay-decode-packet', (event, packet) => packet);
const onRelayClearPacket = createIpcSubscription('relay-clear-packet', () => undefined);
const onRelayStatusUpdate = createIpcSubscription(
  'relay-status-update',
  (event, statusData) => statusData,
);
const onRelayQsoLogged = createIpcSubscription('relay-qso-logged', (event, qsoData) => qsoData);
const onUpdateBadgeState = createIpcSubscription('update-badge-state', (event, state) => state);
const onSettingsChanged = createIpcSubscription('settings-changed', (event, settings) => settings);
const onQsoDataRefresh = createIpcSubscription('qso-data-refresh', () => undefined);
const onPotaSpotSelected = createIpcSubscription('pota-spot-selected', (event, spotData) => spotData);

contextBridge.exposeInMainWorld('electron', {
  // Settings API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  validateForwardHost: (host) => ipcRenderer.invoke('validate-forward-host', host),

  // Theme API
  getTheme: () => ipcRenderer.invoke('get-theme'),
  onThemeChanged,

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
  openPotaSpots: () => ipcRenderer.send('open-pota-spots'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  closeQsoEditor: () => ipcRenderer.send('close-qso-editor'),
  closePotaSpots: () => ipcRenderer.send('close-pota-spots'),
  performUpdateAction: () => ipcRenderer.invoke('perform-update-action'),

  // POTA Spots API
  fetchPotaSpots: () => ipcRenderer.invoke('fetch-pota-spots'),
  getPotaSpotsFilters: () => ipcRenderer.invoke('get-pota-spots-filters'),
  savePotaSpotsFilters: (filters) => ipcRenderer.invoke('save-pota-spots-filters', filters),
  selectPotaSpot: (spot) => ipcRenderer.invoke('select-pota-spot', spot),
  sendPotaHighlight: (payload) => ipcRenderer.invoke('send-pota-highlight', payload),

  // Events from relay
  onRelayLog,
  onRelayStatus,
  onRelayError,
  onRelayDecode,
  onRelayDecodePacket,
  onRelayClearPacket,
  onRelayStatusUpdate,
  onRelayQsoLogged,
  onUpdateBadgeState,
  onSettingsChanged,
  onQsoDataRefresh,
  onPotaSpotSelected,
  notifyQsoDataChanged: () => ipcRenderer.send('qso-data-changed'),
});
