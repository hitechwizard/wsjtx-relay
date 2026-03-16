function registerRelayHandlers({
  ipcMain,
  getRelay,
  ensureRelayInitialized,
  stopRelayIfRunning,
}) {
  ipcMain.handle('start-relay', () => {
    const relayInstance = ensureRelayInitialized();
    relayInstance.start();
    return { success: true, status: 'running' };
  });

  ipcMain.handle('stop-relay', () => {
    stopRelayIfRunning(getRelay());
    return { success: true, status: 'stopped' };
  });

  ipcMain.handle('get-relay-status', () => {
    const relay = getRelay();
    return relay ? (relay.running ? 'running' : 'stopped') : 'stopped';
  });

  ipcMain.handle('log-qso', (event, qso) => {
    const relay = getRelay();
    if (relay) {
      const packet = relay.createAdifPacket(qso);
      relay.handleMessage(packet, {});

      return { success: true };
    }
    return { success: false, error: 'Relay not running' };
  });
}

module.exports = {
  registerRelayHandlers,
};
