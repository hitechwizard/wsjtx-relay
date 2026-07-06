function createEnsureRelayInitialized({
  getRelay,
  setRelay,
  store,
  WSJTXRelay,
  createRelayInstance,
  bindRelayEventForwarding,
  getMainWindow,
  getPotaSpotsWindow,
  getDxSummitSpotsWindow,
  sendToWindows,
}) {
  return function ensureRelayInitialized() {
    const existingRelay = getRelay();
    if (existingRelay) {
      return existingRelay;
    }

    const listenPort = store.get('listenPort');
    const forwards = store.get('forwards');
    const forwardDelaySeconds = store.get('forwardDelaySeconds', 0.5);

    const relayInstance = createRelayInstance({
      WSJTXRelay,
      listenPort,
      forwards,
      forwardDelaySeconds,
      bindRelayEventForwarding,
      getMainWindow,
      getPotaSpotsWindow,
      getDxSummitSpotsWindow,
      sendToWindows,
    });

    setRelay(relayInstance);
    return relayInstance;
  };
}

module.exports = {
  createEnsureRelayInitialized,
};
