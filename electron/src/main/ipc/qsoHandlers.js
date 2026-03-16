function registerQsoHandlers({
  ipcMain,
  store,
  getRelay,
  isPlainObject,
  sanitizeQsoArray,
  sortQsosForStorage,
  maybeEnrichQsoWithPotaMap,
  fetchPotaSpots,
  enrichQsoWithPotaSpot,
  logPotaRequestFailure,
  updateQsoAtIndex,
  deleteQsoAtIndex,
  resendViaRelay,
}) {
  ipcMain.handle('save-qso', async (event, qso) => {
    if (!isPlainObject(qso)) {
      return { success: false, error: 'Invalid QSO payload' };
    }

    const enrichedQso = await maybeEnrichQsoWithPotaMap({
      qso,
      usePotaSpotMap: store.get('usePotaSpotMap', false),
      fetchPotaSpots,
      enrichQsoWithPotaSpot,
      onPotaRequestFailure: logPotaRequestFailure,
    });
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
    const sanitizedQsos = sanitizeQsoArray(qsos);
    if (!sanitizedQsos) {
      return { success: false, error: 'Invalid QSOs payload' };
    }

    const nextQsos = sortQsosForStorage(sanitizedQsos);

    store.set('qsos', nextQsos);
    return { success: true };
  });

  ipcMain.handle('update-qso', async (event, index, qso) => {
    if (!Number.isInteger(index) || index < 0 || !isPlainObject(qso)) {
      return { success: false, error: 'Invalid update-qso payload' };
    }

    const qsos = store.get('qsos', []);
    const updateResult = updateQsoAtIndex(qsos, index, qso);
    if (updateResult.success) {
      store.set('qsos', updateResult.qsos);
      return { success: true };
    }
    return { success: false, error: updateResult.error };
  });

  ipcMain.handle('delete-qso', (event, index) => {
    if (!Number.isInteger(index) || index < 0) {
      return { success: false, error: 'Invalid delete-qso index' };
    }

    const qsos = store.get('qsos', []);
    const deleteResult = deleteQsoAtIndex(qsos, index);
    if (deleteResult.success) {
      store.set('qsos', deleteResult.qsos);
      return { success: true };
    }
    return { success: false, error: deleteResult.error };
  });

  ipcMain.handle('resend-qso', async (event, qso) => {
    if (!isPlainObject(qso)) {
      return { success: false, error: 'Invalid QSO payload' };
    }

    return resendViaRelay(getRelay(), qso);
  });

  ipcMain.handle('resend-all-qsos', async () => {
    const qsos = store.get('qsos', []);
    return resendViaRelay(getRelay(), qsos);
  });
}

module.exports = {
  registerQsoHandlers,
};
