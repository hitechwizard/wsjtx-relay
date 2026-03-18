function createPotaRequestFailureLogger(getMainWindow) {
  return (message) => {
    const detail = String(message || 'Unknown error').trim();
    const logMessage = `POTA request failed: ${detail}`;
    console.warn(logMessage);

    const mainWindow = getMainWindow();
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('relay-log', logMessage);
    }
  };
}

function createPotaSpotsFetcher(fetchPotaSpotsFromApi, httpsModule, potaSpotsUrl, requestTimeoutMs) {
  return () => fetchPotaSpotsFromApi(httpsModule, potaSpotsUrl, requestTimeoutMs);
}

module.exports = {
  createPotaRequestFailureLogger,
  createPotaSpotsFetcher,
};
