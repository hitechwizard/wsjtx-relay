function closeWindowAndClearRef(getWindow, clearWindowRef) {
  const targetWindow = getWindow();
  if (!targetWindow) {
    return;
  }

  targetWindow.close();
  clearWindowRef();
}

module.exports = {
  closeWindowAndClearRef,
};
