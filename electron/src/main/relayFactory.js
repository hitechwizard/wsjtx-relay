function createRelayInstance({
  WSJTXRelay,
  listenPort,
  forwards,
  forwardDelaySeconds,
  bindRelayEventForwarding,
  getMainWindow,
  getPotaSpotsWindow,
  sendToWindows,
}) {
  const relayInstance = new WSJTXRelay(listenPort, forwards, forwardDelaySeconds);

  bindRelayEventForwarding({
    relayInstance,
    getMainWindow,
    getPotaSpotsWindow,
    sendToWindows,
  });

  return relayInstance;
}

module.exports = {
  createRelayInstance,
};
