function registerLifecycleHandlers({
  app,
  processModule,
  onReady,
  onWindowAllClosed,
  onActivate,
  onExit,
}) {
  app.on('ready', onReady);
  app.on('window-all-closed', onWindowAllClosed);
  app.on('activate', onActivate);
  processModule.on('exit', onExit);
}

module.exports = {
  registerLifecycleHandlers,
};
