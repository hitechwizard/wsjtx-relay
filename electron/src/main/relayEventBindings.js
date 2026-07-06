function bindRelayEventForwarding({
  relayInstance,
  getMainWindow,
  getPotaSpotsWindow,
  getDxSummitSpotsWindow,
  sendToWindows,
}) {
  relayInstance.on('log', (msg) => {
    const mainWindow = getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-log', msg);
  });

  relayInstance.on('status', (status) => {
    const mainWindow = getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-status', status);
  });

  relayInstance.on('error', (msg) => {
    const mainWindow = getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-error', msg);
  });

  relayInstance.on('decode', (msg) => {
    const mainWindow = getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-decode', msg);
  });

  relayInstance.on('decode-packet', (packet) => {
    sendToWindows(
      [getMainWindow(), getPotaSpotsWindow(), getDxSummitSpotsWindow()],
      'relay-decode-packet',
      packet,
    );
  });

  relayInstance.on('clear-packet', () => {
    sendToWindows([getPotaSpotsWindow(), getDxSummitSpotsWindow()], 'relay-clear-packet');
  });

  relayInstance.on('status-update', (statusData) => {
    sendToWindows(
      [getMainWindow(), getPotaSpotsWindow(), getDxSummitSpotsWindow()],
      'relay-status-update',
      statusData,
    );
  });

  relayInstance.on('qso-logged', (qso) => {
    const mainWindow = getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-qso-logged', qso);
  });
}

module.exports = {
  bindRelayEventForwarding,
};
