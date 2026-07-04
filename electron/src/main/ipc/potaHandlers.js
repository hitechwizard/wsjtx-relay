function registerPotaHandlers({
  ipcMain,
  BrowserWindow,
  store,
  isPlainObject,
  fetchPotaSpots,
  shouldPopulateManualQsoForSpot,
  getMainWindow,
  getFlrigMonitor,
  getRelay,
  restoreAndFocusWindow,
}) {
  const parseSpotFrequencyHz = (spot) => {
    const rawFrequency = Number.parseFloat(String(spot?.frequency ?? '').trim());
    if (!Number.isFinite(rawFrequency) || rawFrequency <= 0) {
      return null;
    }

    // POTA spot frequencies are kHz from API; convert to Hz for flrig tuning.
    return Math.round(rawFrequency * 1000);
  };

  const normalizePotaSpotFilters = (filters) => ({
    modeFilter: String(filters?.modeFilter || ''),
    bandFilter: String(filters?.bandFilter || ''),
    regionFilter: String(filters?.regionFilter || ''),
    hideWorked: Boolean(filters?.hideWorked),
    hideQrt: Boolean(filters?.hideQrt),
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
    const storedFilters = store.get('potaSpotsFilters', {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      hideWorked: false,
      hideQrt: false,
    });

    const normalizedFilters = normalizePotaSpotFilters(storedFilters);
    store.set('potaSpotsFilters', normalizedFilters);
    return normalizedFilters;
  });

  ipcMain.handle('save-pota-spots-filters', (event, filters) => {
    if (!isPlainObject(filters)) {
      return { success: false, error: 'Invalid filter payload' };
    }

    const nextFilters = normalizePotaSpotFilters(filters);
    store.set('potaSpotsFilters', nextFilters);
    return { success: true };
  });

  ipcMain.handle('select-pota-spot', async (event, spot) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const payload = isPlainObject(spot) && 'spot' in spot ? spot : { spot, decodePacket: null };
    const selectedSpot = isPlainObject(payload?.spot) ? payload.spot : {};
    const decodePacket = isPlainObject(payload?.decodePacket) ? payload.decodePacket : null;

    const mainWindow = getMainWindow();
    if (!mainWindow || !mainWindow.webContents) {
      return { success: false, error: 'Main window is not available' };
    }

    if (shouldPopulateManualQsoForSpot(selectedSpot)) {
      mainWindow.webContents.send('pota-spot-selected', selectedSpot);

      const flrigMonitor = typeof getFlrigMonitor === 'function' ? getFlrigMonitor() : null;
      const shouldTuneViaFlrig =
        flrigMonitor &&
        typeof flrigMonitor.isConnected === 'function' &&
        flrigMonitor.isConnected() &&
        typeof flrigMonitor.tuneFrequencyHz === 'function';

      if (shouldTuneViaFlrig) {
        const frequencyHz = parseSpotFrequencyHz(selectedSpot);
        if (frequencyHz) {
          mainWindow.webContents.send('relay-log', `flrig tune requested: ${frequencyHz} Hz`);
          await flrigMonitor.tuneFrequencyHz(frequencyHz);
        }
      }
    } else {
      if (!decodePacket) {
        return { success: false, error: 'No matching decode packet available for this spot' };
      }

      const relay = getRelay();
      if (!relay || !relay.running || typeof relay.sendReplyPacket !== 'function') {
        return { success: false, error: 'Relay is not running' };
      }

      try {
        await relay.sendReplyPacket(decodePacket);
      } catch (error) {
        return {
          success: false,
          error: error && error.message ? error.message : String(error),
        };
      }
    }

    restoreAndFocusWindow(sourceWindow);

    return { success: true };
  });

  ipcMain.handle('send-pota-highlight', async (event, payload) => {
    const highlightPayload = isPlainObject(payload) ? payload : {};
    const decodePacket = isPlainObject(highlightPayload.decodePacket)
      ? highlightPayload.decodePacket
      : null;
    const callsign = String(highlightPayload.callsign || '')
      .trim()
      .toUpperCase();

    if (!callsign) {
      return { success: false, error: 'Missing callsign for highlight packet' };
    }

    const relay = getRelay();
    if (!relay || !relay.running || typeof relay.sendHighlightPacket !== 'function') {
      return { success: false, error: 'Relay is not running' };
    }

    try {
      await relay.sendHighlightPacket({
        decodePacket,
        callsign,
        bgColor: {
          spec: 1,
          alpha: 65535,
          red: 0,
          green: 25700,
          blue: 0,
        },
        fgColor: {
          spec: 1,
          alpha: 65535,
          red: 65535,
          green: 65535,
          blue: 0,
        },
        highlightLast: true,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error && error.message ? error.message : String(error),
      };
    }
  });
}

module.exports = {
  registerPotaHandlers,
};
