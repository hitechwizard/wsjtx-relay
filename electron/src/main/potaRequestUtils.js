function createActivityLogSender(getMainWindow) {
  return (message) => {
    const mainWindow = getMainWindow();
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('relay-log', message);
    }
  };
}

function createPotaRequestFailureLogger(getMainWindow) {
  const sendToActivityLog = createActivityLogSender(getMainWindow);
  return (message) => {
    const detail = String(message || 'Unknown error').trim();
    const logMessage = `POTA request failed: ${detail}`;
    console.warn(logMessage);
    sendToActivityLog(logMessage);
  };
}

function createPotaSpotsFetcher(fetchPotaSpotsFromApi, httpsModule, potaSpotsUrl, requestTimeoutMs) {
  return () => fetchPotaSpotsFromApi(httpsModule, potaSpotsUrl, requestTimeoutMs);
}

module.exports = {
  createActivityLogSender,
  createPotaRequestFailureLogger,
  createPotaSpotsFetcher,
};
