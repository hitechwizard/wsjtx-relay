function getKnownWindows(windowRefs) {
  if (!Array.isArray(windowRefs)) {
    return [];
  }

  return windowRefs.filter((windowRef) => windowRef && !windowRef.isDestroyed());
}

function hasVisibleWindow(windowRefs) {
  return getKnownWindows(windowRefs).some((windowRef) => windowRef.isVisible());
}

function handleAppActivate({
  mainWindow,
  windowRefs,
  createWindow,
  bringWindowToFront,
}) {
  if (mainWindow === null) {
    createWindow();
    return;
  }

  if (hasVisibleWindow(windowRefs)) {
    return;
  }

  bringWindowToFront(mainWindow);
}

function handleWindowAllClosed({
  updateController,
  relay,
  stopRelayIfRunning,
  appModule,
  platform,
}) {
  if (updateController) {
    updateController.dispose();
  }

  stopRelayIfRunning(relay);

  if (platform !== 'darwin') {
    appModule.quit();
  }
}

function handleProcessExit({ relay, stopRelayIfRunning }) {
  stopRelayIfRunning(relay);
}

module.exports = {
  getKnownWindows,
  hasVisibleWindow,
  handleAppActivate,
  handleWindowAllClosed,
  handleProcessExit,
};
