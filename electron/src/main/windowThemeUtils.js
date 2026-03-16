function attachThemeOnLoad(targetWindow, getTheme) {
  if (!targetWindow || !targetWindow.webContents) {
    return;
  }

  targetWindow.webContents.on('did-finish-load', () => {
    const theme = getTheme();
    targetWindow.webContents.send('theme-changed', theme);
  });
}

module.exports = {
  attachThemeOnLoad,
};
