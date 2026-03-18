function registerUiCommandHandlers({
  ipcMain,
  store,
  getMainWindow,
  getQsoEditorWindow,
  getPotaSpotsWindow,
  openSettings,
  closeSettings,
  openQsoEditor,
  closeQsoEditor,
  openPotaSpots,
  closePotaSpots,
  sendToWindows,
  performUpdateAction,
}) {
  ipcMain.on('open-settings', openSettings);
  ipcMain.on('close-settings', closeSettings);

  ipcMain.on('open-qso-editor', openQsoEditor);
  ipcMain.on('close-qso-editor', closeQsoEditor);

  ipcMain.on('open-pota-spots', openPotaSpots);
  ipcMain.on('close-pota-spots', closePotaSpots);

  ipcMain.handle('get-theme', () => {
    return store.get('theme', 'light');
  });

  ipcMain.on('qso-data-changed', () => {
    sendToWindows([getMainWindow(), getQsoEditorWindow(), getPotaSpotsWindow()], 'qso-data-refresh');
  });

  ipcMain.handle('perform-update-action', async () => {
    await performUpdateAction();
    return { success: true };
  });
}

module.exports = {
  registerUiCommandHandlers,
};
