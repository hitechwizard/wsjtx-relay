function registerSettingsHandlers({
  ipcMain,
  store,
  getRelay,
  isPlainObject,
  toClampedInteger,
  toNonNegativeNumber,
  sanitizeForwards,
  allowedThemes,
  sendToAllWindows,
  readSettingsSnapshot,
  dns,
  validateForwardHostLookup,
}) {
  ipcMain.handle('get-settings', () => {
    return readSettingsSnapshot(store, { includeQsos: true });
  });

  ipcMain.handle('validate-forward-host', async (event, host) => {
    return validateForwardHostLookup(dns, host);
  });

  ipcMain.handle(
    'save-settings',
    (event, payload = {}) => {
      if (!isPlainObject(payload)) {
        return { success: false, error: 'Invalid settings payload' };
      }

      const listenPort = toClampedInteger(payload.listenPort, 1, 65535);
      const forwards = sanitizeForwards(payload.forwards);
      const forwardDelaySeconds = toNonNegativeNumber(payload.forwardDelaySeconds);
      const decodeSightingExpirationMinutes = toClampedInteger(
        payload.decodeSightingExpirationMinutes,
        0,
        3650,
      );

      if (listenPort === null || forwards === null) {
        return { success: false, error: 'Invalid listen port or forwards configuration' };
      }

      store.set('listenPort', listenPort);
      store.set('forwards', forwards);
      if (typeof payload.autoStartRelay === 'boolean') {
        store.set('autoStartRelay', payload.autoStartRelay);
      }
      if (typeof payload.usePotaSpotMap === 'boolean') {
        store.set('usePotaSpotMap', payload.usePotaSpotMap);
      }
      if (forwardDelaySeconds !== null) {
        store.set('forwardDelaySeconds', forwardDelaySeconds);
      }
      if (decodeSightingExpirationMinutes !== null) {
        store.set('decodeSightingExpirationMinutes', decodeSightingExpirationMinutes);
      }
      if (Array.isArray(payload.activityPacketFilters)) {
        const sanitizedPacketFilters = payload.activityPacketFilters
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        store.set('activityPacketFilters', sanitizedPacketFilters);
      }
      if (allowedThemes.has(String(payload.theme || '').trim())) {
        store.set('theme', String(payload.theme).trim());
      }

      const relay = getRelay();
      if (relay && relay.running) {
        relay.updateSettings(listenPort, forwards, store.get('forwardDelaySeconds', 0.5));
      }

      const updatedSettings = readSettingsSnapshot(store, { themeFallback: 'light' });

      sendToAllWindows('settings-changed', updatedSettings);

      if (allowedThemes.has(String(payload.theme || '').trim())) {
        sendToAllWindows('theme-changed', String(payload.theme).trim());
      }

      return { success: true };
    },
  );
}

module.exports = {
  registerSettingsHandlers,
};
