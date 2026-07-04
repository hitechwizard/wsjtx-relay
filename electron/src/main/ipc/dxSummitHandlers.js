function registerDxSummitHandlers({
  ipcMain,
  BrowserWindow,
  store,
  isPlainObject,
  fetchDxSummitSpots,
  shouldPopulateManualQsoForDxSpot,
  getMainWindow,
  getRelay,
  restoreAndFocusWindow,
}) {
  const normalizeDxSummitSpotFilters = (filters) => ({
    modeFilter: String(filters?.modeFilter || ''),
    bandFilter: String(filters?.bandFilter || ''),
    regionFilter: String(filters?.regionFilter || ''),
    callFilter: String(filters?.callFilter || ''),
    hideWorked: Boolean(filters?.hideWorked),
    hideQrt: Boolean(filters?.hideQrt),
  });

  ipcMain.handle('fetch-dx-summit-spots', async () => {
    try {
      const spots = await fetchDxSummitSpots();
      return { success: true, spots };
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('get-dx-summit-spots-filters', () => {
    const storedFilters = store.get('dxSummitSpotsFilters', {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      callFilter: '',
      hideWorked: false,
      hideQrt: false,
    });

    const normalizedFilters = normalizeDxSummitSpotFilters(storedFilters);
    store.set('dxSummitSpotsFilters', normalizedFilters);
    return normalizedFilters;
  });

  ipcMain.handle('save-dx-summit-spots-filters', (event, filters) => {
    if (!isPlainObject(filters)) {
      return { success: false, error: 'Invalid filter payload' };
    }

    const nextFilters = normalizeDxSummitSpotFilters(filters);
    store.set('dxSummitSpotsFilters', nextFilters);
    return { success: true };
  });

  ipcMain.handle('select-dx-summit-spot', async (event, spot) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const payload = isPlainObject(spot) && 'spot' in spot ? spot : { spot, decodePacket: null };
    const selectedSpot = isPlainObject(payload?.spot) ? payload.spot : {};
    const decodePacket = isPlainObject(payload?.decodePacket) ? payload.decodePacket : null;

    const mainWindow = getMainWindow();
    if (!mainWindow || !mainWindow.webContents) {
      return { success: false, error: 'Main window is not available' };
    }

    if (shouldPopulateManualQsoForDxSpot(selectedSpot)) {
      mainWindow.webContents.send('dx-summit-spot-selected', selectedSpot);
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
}

module.exports = {
  registerDxSummitHandlers,
};
