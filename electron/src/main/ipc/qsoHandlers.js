function registerQsoHandlers({
  ipcMain,
  store,
  getRelay,
  fetchImpl,
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
  const { submitQsoToQrz } = require('../qrzLoggingService');
  const { submitQsoToClublog } = require('../clublogLoggingService');
  const {
    hasLoggingSubmissionSuccess,
    markLoggingSubmissionSuccess,
  } = require('../qsoLoggingUtils');

  ipcMain.handle('save-qso', async (event, qso) => {
    if (!isPlainObject(qso)) {
      return { success: false, error: 'Invalid QSO payload' };
    }

    let nextQso = await maybeEnrichQsoWithPotaMap({
      qso,
      usePotaSpotMap: store.get('usePotaSpotMap', false),
      fetchPotaSpots,
      enrichQsoWithPotaSpot,
      onPotaRequestFailure: logPotaRequestFailure,
    });

    const qrzLoggingEnabled = store.get('qrzLoggingEnabled', false);
    const qrzApiKey = String(store.get('qrzApiKey', '') || '').trim();
    const shouldSubmitToQrz =
      qrzLoggingEnabled &&
      Boolean(qrzApiKey) &&
      !hasLoggingSubmissionSuccess(nextQso, 'qrz');

    if (shouldSubmitToQrz) {
      const qrzResult = await submitQsoToQrz({
        fetchImpl,
        apiKey: qrzApiKey,
        qso: nextQso,
      });

      if (qrzResult.success) {
        const qrzLogId = String(qrzResult.logId || '').trim();
        nextQso = markLoggingSubmissionSuccess(nextQso, 'qrz', {
          logId: qrzLogId,
        });
      } else {
        const failureMessage = String(qrzResult.error || 'Unknown QRZ logging failure').trim();
        console.warn(`QRZ logging failed: ${failureMessage}`);
      }
    }

    const clublogLoggingEnabled = store.get('clublogLoggingEnabled', false);
    const clublogCallsign = String(store.get('clublogCallsign', '') || '').trim();
    const clublogPassword = String(store.get('clublogPassword', '') || '').trim();
    const clublogEmail = String(store.get('clublogEmail', '') || '').trim();
    const shouldSubmitToClublog =
      clublogLoggingEnabled &&
      Boolean(clublogCallsign) &&
      Boolean(clublogPassword) &&
      Boolean(clublogEmail) &&
      !hasLoggingSubmissionSuccess(nextQso, 'clublog');

    if (shouldSubmitToClublog) {
      const clublogResult = await submitQsoToClublog({
        fetchImpl,
        callsign: clublogCallsign,
        password: clublogPassword,
        email: clublogEmail,
        qso: nextQso,
      });

      if (clublogResult.success) {
        nextQso = markLoggingSubmissionSuccess(nextQso, 'clublog');
      } else {
        const failureMessage = String(clublogResult.error || 'Unknown Clublog logging failure').trim();
        console.warn(`Clublog logging failed: ${failureMessage}`);
      }
    }

    const qsos = store.get('qsos', []);
    qsos.push(nextQso);
    store.set('qsos', qsos);
    return { success: true, qso: nextQso };
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
