function startRelayIfEnabled(store, ensureRelayInitialized) {
  if (!store.get('autoStartRelay', false)) {
    return;
  }

  const relayInstance = ensureRelayInitialized();
  relayInstance.start();
}

function setupApplicationMenu({
  Menu,
  buildApplicationMenuTemplate,
  templateOptions,
}) {
  const template = buildApplicationMenuTemplate(templateOptions);
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = {
  startRelayIfEnabled,
  setupApplicationMenu,
};
