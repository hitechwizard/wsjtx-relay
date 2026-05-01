function registerQsoHandlers({
  ipcMain,
  store,
  qsoStore,
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
      qrzLoggingEnabled && Boolean(qrzApiKey) && !hasLoggingSubmissionSuccess(nextQso, 'qrz');

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
        const failureMessage = String(
          clublogResult.error || 'Unknown Clublog logging failure',
        ).trim();
        nextQso = markLoggingSubmissionFailure(nextQso, 'clublog', failureMessage);
        console.warn(`Clublog logging failed: ${failureMessage}`);
        logToActivityLog(`Clublog submission failed: ${failureMessage}`);
      }
    }

    const qsos = qsoStore.get('qsos', []);
    qsos.push(nextQso);
    qsoStore.set('qsos', qsos);
    return { success: true, qso: nextQso };
  });

  ipcMain.handle('clear-qsos', () => {
    qsoStore.set('qsos', []);
    return { success: true };
  });

  ipcMain.handle('get-qsos', () => {
    return qsoStore.get('qsos', []);
  });

  ipcMain.handle('update-qsos', async (event, qsos) => {
    const sanitizedQsos = sanitizeQsoArray(qsos);
    if (!sanitizedQsos) {
      return { success: false, error: 'Invalid QSOs payload' };
    }

    const nextQsos = sortQsosForStorage(sanitizedQsos);

    qsoStore.set('qsos', nextQsos);
    return { success: true };
  });

  ipcMain.handle('update-qso', async (event, index, qso) => {
    if (!Number.isInteger(index) || index < 0 || !isPlainObject(qso)) {
      return { success: false, error: 'Invalid update-qso payload' };
    }

    const qsos = qsoStore.get('qsos', []);
    const updateResult = updateQsoAtIndex(qsos, index, qso);
    if (updateResult.success) {
      qsoStore.set('qsos', updateResult.qsos);
      return { success: true };
    }
    return { success: false, error: updateResult.error };
  });

  ipcMain.handle('delete-qso', (event, index) => {
    if (!Number.isInteger(index) || index < 0) {
      return { success: false, error: 'Invalid delete-qso index' };
    }

    const qsos = qsoStore.get('qsos', []);
    const deleteResult = deleteQsoAtIndex(qsos, index);
    if (deleteResult.success) {
      qsoStore.set('qsos', deleteResult.qsos);
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
    const qsos = qsoStore.get('qsos', []);
    return resendViaRelay(getRelay(), qsos);
  });

  ipcMain.handle('resubmit-qso-log', async (event, index, provider) => {
    if (!Number.isInteger(index) || index < 0) {
      return { success: false, error: 'Invalid QSO index' };
    }
    if (provider !== 'qrz' && provider !== 'clublog') {
      return { success: false, error: 'Invalid provider' };
    }

    const qsos = qsoStore.get('qsos', []);
    if (index >= qsos.length) {
      return { success: false, error: 'QSO not found' };
    }

    let qso = { ...qsos[index] };

    if (provider === 'qrz') {
      const qrzLoggingEnabled = store.get('qrzLoggingEnabled', false);
      const qrzApiKey = String(store.get('qrzApiKey', '') || '').trim();
      if (!qrzLoggingEnabled || !qrzApiKey) {
        return { success: false, error: 'QRZ logging is not configured' };
      }

      const result = await submitQsoToQrz({ fetchImpl, apiKey: qrzApiKey, qso });
      if (result.success) {
        const logId = String(result.logId || '').trim();
        qso = markLoggingSubmissionSuccess(qso, 'qrz', { logId });
        logToActivityLog(`QRZ resubmission accepted QSO as entry #${logId}`);
      } else {
        const msg = String(result.error || 'Unknown QRZ logging failure').trim();
        qso = markLoggingSubmissionFailure(qso, 'qrz', msg);
        logToActivityLog(`QRZ resubmission failed: ${msg}`);
        const updateResult = updateQsoAtIndex(qsoStore.get('qsos', []), index, qso);
        if (updateResult.success) qsoStore.set('qsos', updateResult.qsos);
        return { success: false, error: msg, qso };
      }
    } else {
      const clublogLoggingEnabled = store.get('clublogLoggingEnabled', false);
      const clublogCallsign = String(store.get('clublogCallsign', '') || '').trim();
      const clublogPassword = String(store.get('clublogPassword', '') || '').trim();
      const clublogEmail = String(store.get('clublogEmail', '') || '').trim();
      if (!clublogLoggingEnabled || !clublogCallsign || !clublogPassword || !clublogEmail) {
        return { success: false, error: 'Clublog logging is not configured' };
      }

      const result = await submitQsoToClublog({
        fetchImpl,
        callsign: clublogCallsign,
        password: clublogPassword,
        email: clublogEmail,
        qso,
      });
      if (result.success) {
        qso = markLoggingSubmissionSuccess(qso, 'clublog');
        logToActivityLog('Clublog resubmission succeeded');
      } else {
        const msg = String(result.error || 'Unknown Clublog logging failure').trim();
        qso = markLoggingSubmissionFailure(qso, 'clublog', msg);
        logToActivityLog(`Clublog resubmission failed: ${msg}`);
        const updateResult = updateQsoAtIndex(qsoStore.get('qsos', []), index, qso);
        if (updateResult.success) qsoStore.set('qsos', updateResult.qsos);
        return { success: false, error: msg, qso };
      }
    }

    const freshQsos = qsoStore.get('qsos', []);
    const updateResult = updateQsoAtIndex(freshQsos, index, qso);
    if (updateResult.success) {
      qsoStore.set('qsos', updateResult.qsos);
      return { success: true, qso };
    }
    return { success: false, error: 'Failed to save updated QSO' };
  });
}

module.exports = {
  registerQsoHandlers,
};
