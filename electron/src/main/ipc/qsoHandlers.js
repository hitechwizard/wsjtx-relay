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
  logToActivityLog,
  updateQsoAtIndex,
  deleteQsoAtIndex,
  resendViaRelay,
}) {
  const { submitQsoToQrz } = require('../qrzLoggingService');
  const { submitQsoToClublog } = require('../clublogLoggingService');
  const {
    hasLoggingSubmissionSuccess,
    markLoggingSubmissionSuccess,
    markLoggingSubmissionFailure,
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

    // Send POTA spot if sig_info present and Use POTA Spot Map enabled
    const usePotaSpotMap = store.get('usePotaSpotMap', false);
    if (
      usePotaSpotMap &&
      nextQso.sig_info &&
      typeof nextQso.sig_info === 'string' &&
      nextQso.sig_info.trim() !== ''
    ) {
      try {
        const reportMode = nextQso.submode ? nextQso.submode : nextQso.mode;
        const spotPayload = {
          activator: nextQso.call,
          spotter: nextQso.station_callsign,
          frequency: nextQso.freq,
          reference: nextQso.sig_info,
          mode: reportMode,
          source: 'WSJTX-RELAY',
          comments: `${reportMode} Sent: ${nextQso.rst_sent} Rcvd: ${nextQso.rst_rcvd}`,
          activatorGrid: nextQso.gridsquare,
          spotterGrid: nextQso.my_gridsquare,
        };
        const response = await fetchImpl('https://api.pota.app/spot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spotPayload),
        });
        if (!response.ok) {
          logToActivityLog(`POTA spot POST failed: ${response.status} ${response.statusText}`);
        } else {
          logToActivityLog('POTA spot POST succeeded');
        }
      } catch (err) {
        logToActivityLog(`POTA spot POST error: ${err.message || err}`);
      }
    }

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
        logToActivityLog(`QRZ accepted QSO as entry #${qrzLogId}`);
      } else {
        const failureMessage = String(qrzResult.error || 'Unknown QRZ logging failure').trim();
        nextQso = markLoggingSubmissionFailure(nextQso, 'qrz', failureMessage);
        console.warn(`QRZ logging failed: ${failureMessage}`);
        logToActivityLog(`QRZ submission failed: ${failureMessage}`);
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
        logToActivityLog(`Clublog submission succeeded`);
      } else {
        const failureMessage = String(clublogResult.error || 'Unknown Clublog logging failure').trim();
        nextQso = markLoggingSubmissionFailure(nextQso, 'qrz', failureMessage);
        console.warn(`Clublog logging failed: ${failureMessage}`);
        logToActivityLog(`Clublog submission failed: ${failureMessage}`);
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
