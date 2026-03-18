async function showInstallDownloadedUpdatePrompt(dialogModule, targetWindow) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'question',
    title: 'Install Update',
    message: 'An update has been downloaded and is ready to install.',
    detail: 'Do you want to restart now and install the update?',
    buttons: ['Install & Restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
}

async function showDownloadAvailableUpdatePrompt(dialogModule, targetWindow, updateInfo) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'question',
    title: 'Update Available',
    message: `Version ${updateInfo.version} is available.`,
    detail: 'Do you want to download and install it?',
    buttons: ['Download & Install', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
}

async function showUpdateDownloadNoInternet(dialogModule, targetWindow) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'info',
    title: 'Update Download',
    message: 'No internet connection detected. Download skipped.',
    buttons: ['OK'],
  });
}

async function showUpdateDownloadFailed(dialogModule, targetWindow, message) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'error',
    title: 'Update Download Failed',
    message,
    buttons: ['OK'],
  });
}

async function showCheckForUpdatesCurrentVersion(dialogModule, targetWindow, currentVersion) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'info',
    title: 'Check for Updates',
    message: `You are on the current version (${currentVersion}).`,
    buttons: ['OK'],
  });
}

async function showCheckForUpdatesPackagedOnly(dialogModule, targetWindow) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'info',
    title: 'Check for Updates',
    message: 'Update checks are only available in packaged builds.',
    buttons: ['OK'],
  });
}

async function showCheckForUpdatesInProgress(dialogModule, targetWindow) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'info',
    title: 'Check for Updates',
    message: 'An update check is already in progress.',
    buttons: ['OK'],
  });
}

async function showCheckForUpdatesNoInternet(dialogModule, targetWindow) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'info',
    title: 'Check for Updates',
    message: 'No internet connection detected. Skipping this check.',
    buttons: ['OK'],
  });
}

async function showCheckForUpdatesFailed(dialogModule, targetWindow, message) {
  return dialogModule.showMessageBox(targetWindow, {
    type: 'error',
    title: 'Update Check Failed',
    message,
    buttons: ['OK'],
  });
}

module.exports = {
  showInstallDownloadedUpdatePrompt,
  showDownloadAvailableUpdatePrompt,
  showUpdateDownloadNoInternet,
  showUpdateDownloadFailed,
  showCheckForUpdatesCurrentVersion,
  showCheckForUpdatesPackagedOnly,
  showCheckForUpdatesInProgress,
  showCheckForUpdatesNoInternet,
  showCheckForUpdatesFailed,
};
