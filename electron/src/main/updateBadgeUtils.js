const { isVersionNewer } = require('./versionUtils');

function hasNewerUpdateAvailable(availableUpdateInfo, currentVersion) {
  if (!availableUpdateInfo || !availableUpdateInfo.version) {
    return false;
  }

  return isVersionNewer(availableUpdateInfo.version, currentVersion);
}

function getUpdateBadgeState({ updateReadyToInstall, availableUpdateInfo, currentVersion }) {
  if (updateReadyToInstall) {
    return {
      visible: true,
      kind: 'ready',
      label: 'Install Update',
    };
  }

  if (hasNewerUpdateAvailable(availableUpdateInfo, currentVersion)) {
    const version = availableUpdateInfo.version ? ` ${availableUpdateInfo.version}` : '';
    return {
      visible: true,
      kind: 'available',
      label: `Update Available${version}`,
    };
  }

  return { visible: false };
}

module.exports = {
  hasNewerUpdateAvailable,
  getUpdateBadgeState,
};
