function registerSettingsHandlers({
  ipcMain,
  store,
  qsoStore,
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
    return readSettingsSnapshot(store, { includeQsos: true, qsoStore });
  });

  ipcMain.handle('validate-forward-host', async (event, host) => {
    return validateForwardHostLookup(dns, host);
  });

  ipcMain.handle('save-settings', (event, payload = {}) => {
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
    const manualQsoEntryType = String(payload.manualQsoEntryType || '')
      .trim()
      .toLowerCase();
    const allowedWorkedMatchFields = new Set(['call', 'band', 'mode', 'date']);
    const workedMatchFields = Array.isArray(payload.dxSummitWorkedMatchFields)
      ? payload.dxSummitWorkedMatchFields
          .map((value) =>
            String(value || '')
              .trim()
              .toLowerCase(),
          )
          .filter((value) => allowedWorkedMatchFields.has(value))
      : null;
    const isManualQsoEntryTypeValid =
      manualQsoEntryType === '' ||
      manualQsoEntryType === 'pota' ||
      manualQsoEntryType === 'arrl-field-day';
    const isWorkedMatchFieldsValid =
      workedMatchFields === null ||
      (workedMatchFields.length > 0 && workedMatchFields.length <= allowedWorkedMatchFields.size);

    if (
      listenPort === null ||
      forwards === null ||
      !isManualQsoEntryTypeValid ||
      !isWorkedMatchFieldsValid
    ) {
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
    if (typeof payload.qrzLoggingEnabled === 'boolean') {
      store.set('qrzLoggingEnabled', payload.qrzLoggingEnabled);
    }
    if (payload.qrzApiKey !== undefined) {
      store.set('qrzApiKey', String(payload.qrzApiKey || '').trim());
    }
    if (typeof payload.clublogLoggingEnabled === 'boolean') {
      store.set('clublogLoggingEnabled', payload.clublogLoggingEnabled);
    }
    if (payload.clublogCallsign !== undefined || payload.clublogUsername !== undefined) {
      store.set(
        'clublogCallsign',
        String(payload.clublogCallsign || payload.clublogUsername || '')
          .trim()
          .toUpperCase(),
      );
    }
    if (payload.clublogPassword !== undefined) {
      store.set('clublogPassword', String(payload.clublogPassword || '').trim());
    }
    if (payload.clublogEmail !== undefined) {
      const email = String(payload.clublogEmail || '').trim();
      // Validate email: must be empty or valid email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        return { success: false, error: 'Invalid email address for Clublog' };
      }
      store.set('clublogEmail', email);
    }
    if (forwardDelaySeconds !== null) {
      store.set('forwardDelaySeconds', forwardDelaySeconds);
    }
    if (decodeSightingExpirationMinutes !== null) {
      store.set('decodeSightingExpirationMinutes', decodeSightingExpirationMinutes);
    }
    if (manualQsoEntryType) {
      store.set('manualQsoEntryType', manualQsoEntryType);
    }
    if (workedMatchFields !== null) {
      store.set('dxSummitWorkedMatchFields', Array.from(new Set(workedMatchFields)));
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
  });
}

module.exports = {
  registerSettingsHandlers,
};
