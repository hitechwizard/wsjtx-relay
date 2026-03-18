function registerAllIpcHandlers({
  registerSettingsHandlers,
  registerRelayHandlers,
  registerQsoHandlers,
  registerAdifHandlers,
  registerPotaHandlers,
  registerUiCommandHandlers,
  settingsDependencies,
  relayDependencies,
  qsoDependencies,
  adifDependencies,
  potaDependencies,
  uiCommandDependencies,
}) {
  registerSettingsHandlers(settingsDependencies);
  registerRelayHandlers(relayDependencies);
  registerQsoHandlers(qsoDependencies);
  registerAdifHandlers(adifDependencies);
  registerPotaHandlers(potaDependencies);
  registerUiCommandHandlers(uiCommandDependencies);
}

module.exports = {
  registerAllIpcHandlers,
};
