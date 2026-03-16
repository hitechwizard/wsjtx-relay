function buildLifecycleHandlerCallbacks({
  createUpdateController,
  buildUpdateControllerConfig,
  updateControllerState,
  app,
  autoUpdater,
  dialog,
  dns,
  getMainWindow,
  hasInternetConnectivity,
  hasNewerUpdateAvailable,
  getUpdateBadgeState,
  showInstallDownloadedUpdatePrompt,
  showDownloadAvailableUpdatePrompt,
  showUpdateDownloadNoInternet,
  showUpdateDownloadFailed,
  showCheckForUpdatesCurrentVersion,
  showCheckForUpdatesPackagedOnly,
  showCheckForUpdatesInProgress,
  showCheckForUpdatesNoInternet,
  showCheckForUpdatesFailed,
  updateCheckIntervalMs,
  internetCheckTimeoutMs,
  createWindow,
  startRelayIfEnabled,
  store,
  ensureRelayInitialized,
  setupApplicationMenu,
  Menu,
  buildApplicationMenuTemplate,
  isMac,
  stopRelayIfRunning,
  getRelay,
  createSettingsWindow,
  createQsoEditorWindow,
  createPotaSpotsWindow,
  createExamplesWindow,
  handleWindowAllClosed,
  processPlatform,
  handleAppActivate,
  bringWindowToFront,
  getWindowRefs,
  handleProcessExit,
}) {
  return {
    onReady: () => {
      updateControllerState.set(
        createUpdateController(
          buildUpdateControllerConfig({
            app,
            autoUpdater,
            dialog,
            dns,
            getMainWindow,
            hasInternetConnectivity,
            hasNewerUpdateAvailable,
            getUpdateBadgeState,
            showInstallDownloadedUpdatePrompt,
            showDownloadAvailableUpdatePrompt,
            showUpdateDownloadNoInternet,
            showUpdateDownloadFailed,
            showCheckForUpdatesCurrentVersion,
            showCheckForUpdatesPackagedOnly,
            showCheckForUpdatesInProgress,
            showCheckForUpdatesNoInternet,
            showCheckForUpdatesFailed,
            updateCheckIntervalMs,
            internetCheckTimeoutMs,
          }),
        ),
      );

      createWindow();
      const updateController = updateControllerState.get();
      updateController && updateController.configureUpdateChecks();
      startRelayIfEnabled(store, ensureRelayInitialized);

      setupApplicationMenu({
        Menu,
        buildApplicationMenuTemplate,
        templateOptions: {
          isMac,
          appName: app.name,
          isPackaged: app.isPackaged,
          onOpenPreferences: createSettingsWindow,
          onExit: () => {
            stopRelayIfRunning(getRelay());
            app.quit();
          },
          onOpenQsoEditor: createQsoEditorWindow,
          onOpenPotaSpots: createPotaSpotsWindow,
          onCheckForUpdates: () => {
            const activeUpdateController = updateControllerState.get();
            activeUpdateController && activeUpdateController.performUpdateAction();
          },
          onOpenExamples: createExamplesWindow,
        },
      });
    },
    onWindowAllClosed: () => {
      handleWindowAllClosed({
        updateController: updateControllerState.get(),
        relay: getRelay(),
        stopRelayIfRunning,
        appModule: app,
        platform: processPlatform,
      });
    },
    onActivate: () => {
      handleAppActivate({
        mainWindow: getMainWindow(),
        windowRefs: getWindowRefs(),
        createWindow,
        bringWindowToFront,
      });
    },
    onExit: () => {
      handleProcessExit({ relay: getRelay(), stopRelayIfRunning });
    },
  };
}

module.exports = {
  buildLifecycleHandlerCallbacks,
};
