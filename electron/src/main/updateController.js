const { createActivityLogSender } = require('./potaRequestUtils');

function createUpdateController({
  appModule,
  autoUpdaterModule,
  dialogModule,
  dnsModule,
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
}) {
  let updateCheckTimer;
  let isUpdateCheckInProgress = false;
  let isInteractiveUpdateCheck = false;
  let isUpdateDownloadInProgress = false;
  let availableUpdateInfo = null;
  let updateReadyToInstall = false;

  // Activity log sender for warnings
  const logToActivityLog = createActivityLogSender(getMainWindow);

  function sendUpdateBadgeState() {
    const mainWindow = getMainWindow();
    if (!mainWindow || !mainWindow.webContents) {
      return;
    }

    mainWindow.webContents.send(
      'update-badge-state',
      getUpdateBadgeState({
        updateReadyToInstall,
        availableUpdateInfo,
        currentVersion: appModule.getVersion(),
      }),
    );
  }

  async function promptToInstallDownloadedUpdate() {
    const mainWindow = getMainWindow();
    if (!mainWindow || !updateReadyToInstall) {
      return;
    }

    const result = await showInstallDownloadedUpdatePrompt(dialogModule, mainWindow);

    if (result.response === 0) {
      autoUpdaterModule.quitAndInstall();
    }
  }

  async function promptToDownloadAvailableUpdate(updateInfo) {
    const mainWindow = getMainWindow();
    if (!mainWindow || !updateInfo) {
      return;
    }

    const result = await showDownloadAvailableUpdatePrompt(dialogModule, mainWindow, updateInfo);

    if (result.response !== 0 || isUpdateDownloadInProgress) {
      return;
    }

    const hasInternet = await hasInternetConnectivity({
      dnsModule,
      timeoutMs: internetCheckTimeoutMs,
    });
    if (!hasInternet) {
      await showUpdateDownloadNoInternet(dialogModule, mainWindow);
      return;
    }

    isUpdateDownloadInProgress = true;
    try {
      await autoUpdaterModule.downloadUpdate();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      await showUpdateDownloadFailed(dialogModule, mainWindow, message);
    } finally {
      isUpdateDownloadInProgress = false;
    }
  }

  async function checkForAppUpdates(options = {}) {
    const { interactive = false } = options;
    const mainWindow = getMainWindow();

    if (!appModule.isPackaged) {
      if (interactive && mainWindow) {
        await showCheckForUpdatesPackagedOnly(dialogModule, mainWindow);
      }
      return;
    }

    if (isUpdateCheckInProgress) {
      if (interactive && mainWindow) {
        await showCheckForUpdatesInProgress(dialogModule, mainWindow);
      }
      return;
    }

    isInteractiveUpdateCheck = interactive;

    const hasInternet = await hasInternetConnectivity({
      dnsModule,
      timeoutMs: internetCheckTimeoutMs,
    });
    if (!hasInternet) {
      if (interactive && mainWindow) {
        await showCheckForUpdatesNoInternet(dialogModule, mainWindow);
      }
      isInteractiveUpdateCheck = false;
      return;
    }

    isUpdateCheckInProgress = true;
    try {
      await autoUpdaterModule.checkForUpdates();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn(`Update check failed: ${message}`);
      logToActivityLog(`Update check failed: ${message}`);
      if (interactive && mainWindow) {
        await showCheckForUpdatesFailed(dialogModule, mainWindow, message);
      }
      isInteractiveUpdateCheck = false;
    } finally {
      isUpdateCheckInProgress = false;
    }
  }

  async function performUpdateAction() {
    if (updateReadyToInstall) {
      await promptToInstallDownloadedUpdate();
      return;
    }

    if (availableUpdateInfo) {
      await promptToDownloadAvailableUpdate(availableUpdateInfo);
      return;
    }

    await checkForAppUpdates({ interactive: true });
  }

  function setupAutoUpdaterEventHandlers() {
    autoUpdaterModule.on('update-not-available', () => {
      const mainWindow = getMainWindow();

      if (!updateReadyToInstall) {
        availableUpdateInfo = null;
        sendUpdateBadgeState();
      }

      if (!isInteractiveUpdateCheck || !mainWindow) {
        isInteractiveUpdateCheck = false;
        return;
      }

      showCheckForUpdatesCurrentVersion(dialogModule, mainWindow, appModule.getVersion());

      isInteractiveUpdateCheck = false;
    });

    autoUpdaterModule.on('update-available', async (updateInfo) => {
      if (!hasNewerUpdateAvailable(updateInfo, appModule.getVersion())) {
        availableUpdateInfo = null;
        sendUpdateBadgeState();
        isInteractiveUpdateCheck = false;
        return;
      }

      availableUpdateInfo = updateInfo;
      sendUpdateBadgeState();

      const mainWindow = getMainWindow();
      if (!isInteractiveUpdateCheck || !mainWindow) {
        isInteractiveUpdateCheck = false;
        return;
      }

      await promptToDownloadAvailableUpdate(updateInfo);

      isInteractiveUpdateCheck = false;
    });

    autoUpdaterModule.on('update-downloaded', async () => {
      updateReadyToInstall = true;
      sendUpdateBadgeState();
      await promptToInstallDownloadedUpdate();
    });

    autoUpdaterModule.on('error', async (err) => {
      const message = err && err.message ? err.message : String(err);
      console.warn(`Update check failed: ${message}`);
      logToActivityLog(`Update check failed: ${message}`);

      if (message.includes('latest-mac.yml')) {
        availableUpdateInfo = null;
        sendUpdateBadgeState();
      }

      const mainWindow = getMainWindow();
      if (isInteractiveUpdateCheck && mainWindow) {
        const detailMessage = message.includes('latest-mac.yml')
          ? 'This release is missing macOS auto-update metadata (latest-mac.yml). Publish a new release that includes macOS ZIP + DMG artifacts, then try again.'
          : message;
        await showCheckForUpdatesFailed(dialogModule, mainWindow, detailMessage);
      }

      isInteractiveUpdateCheck = false;
      isUpdateDownloadInProgress = false;
    });
  }

  function configureUpdateChecks() {
    if (!appModule.isPackaged) {
      return;
    }

    autoUpdaterModule.autoDownload = false;
    autoUpdaterModule.autoInstallOnAppQuit = true;
    setupAutoUpdaterEventHandlers();

    checkForAppUpdates();
    updateCheckTimer = setInterval(() => {
      checkForAppUpdates();
    }, updateCheckIntervalMs);
  }

  function dispose() {
    if (updateCheckTimer) {
      clearInterval(updateCheckTimer);
      updateCheckTimer = null;
    }
  }

  return {
    sendUpdateBadgeState,
    performUpdateAction,
    configureUpdateChecks,
    dispose,
  };
}

module.exports = {
  createUpdateController,
};
