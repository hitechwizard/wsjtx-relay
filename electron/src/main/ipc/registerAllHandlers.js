function registerAllIpcHandlers({
  registerSettingsHandlers,
  registerRelayHandlers,
  registerQsoHandlers,
  registerAdifHandlers,
  registerPotaHandlers,
  registerDxSummitHandlers,
  registerUiCommandHandlers,
  settingsDependencies,
  relayDependencies,
  qsoDependencies,
  adifDependencies,
  potaDependencies,
  dxSummitDependencies,
  uiCommandDependencies,
}) {
  registerSettingsHandlers(settingsDependencies);
  registerRelayHandlers(relayDependencies);
  registerQsoHandlers(qsoDependencies);
  registerAdifHandlers(adifDependencies);
  registerPotaHandlers(potaDependencies);
  registerDxSummitHandlers(dxSummitDependencies);
  registerUiCommandHandlers(uiCommandDependencies);
}

module.exports = {
  registerAllIpcHandlers,
};
