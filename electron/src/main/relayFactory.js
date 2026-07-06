function createRelayInstance({
  WSJTXRelay,
  listenPort,
  forwards,
  forwardDelaySeconds,
  bindRelayEventForwarding,
  getMainWindow,
  getPotaSpotsWindow,
  getDxSummitSpotsWindow,
  sendToWindows,
}) {
  const relayInstance = new WSJTXRelay(listenPort, forwards, forwardDelaySeconds);

  bindRelayEventForwarding({
    relayInstance,
    getMainWindow,
    getPotaSpotsWindow,
    getDxSummitSpotsWindow,
    sendToWindows,
  });

  return relayInstance;
}

module.exports = {
  createRelayInstance,
};
