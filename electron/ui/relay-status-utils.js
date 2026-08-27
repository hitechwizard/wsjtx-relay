(function registerRelayStatusUtils(globalScope) {
  function hasOwnValue(target, key) {
    return Boolean(target) && Object.prototype.hasOwnProperty.call(target, key);
  }

  function resolveCallsignField(statusData, keys, currentValue) {
    for (const key of keys) {
      if (!hasOwnValue(statusData, key)) {
        continue;
      }

      const value = statusData[key];
      if (value === null || value === undefined) {
        return '';
      }

      return String(value).trim().toUpperCase();
    }

    return currentValue;
  }

  function resolveBooleanField(statusData, key, currentValue) {
    if (!hasOwnValue(statusData, key)) {
      return currentValue;
    }

    const value = statusData[key];
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === null || value === undefined) {
      return false;
    }

    return currentValue;
  }

  function mergeRelayTxStatus(currentTxStatus, stationCallsign, statusData) {
    const safeCurrentTxStatus = currentTxStatus || {
      dxCall: '',
      txEnabled: false,
      transmitting: false,
    };

    const nextTxStatus = {
      dxCall: resolveCallsignField(statusData, ['dxcall', 'dxCall'], safeCurrentTxStatus.dxCall),
      txEnabled: resolveBooleanField(statusData, 'txEnabled', safeCurrentTxStatus.txEnabled),
      transmitting: resolveBooleanField(
        statusData,
        'transmitting',
        safeCurrentTxStatus.transmitting,
      ),
    };

    const nextStationCallsign = resolveCallsignField(
      statusData,
      ['deCall', 'decall'],
      String(stationCallsign || '')
        .trim()
        .toUpperCase(),
    );

    const hasChanges =
      nextTxStatus.dxCall !== safeCurrentTxStatus.dxCall ||
      nextTxStatus.txEnabled !== safeCurrentTxStatus.txEnabled ||
      nextTxStatus.transmitting !== safeCurrentTxStatus.transmitting ||
      nextStationCallsign !==
        String(stationCallsign || '')
          .trim()
          .toUpperCase();

    return {
      nextTxStatus,
      nextStationCallsign,
      hasChanges,
    };
  }

  globalScope.wsjtxRelayStatusUtils = {
    mergeRelayTxStatus,
  };
})(window);
