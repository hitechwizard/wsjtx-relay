function tryBringExistingWindow(windowRef, bringWindowToFront) {
  if (!windowRef) {
    return false;
  }

  bringWindowToFront(windowRef);
  return true;
}

function attachClearOnClosed(windowRef, clearWindowRef) {
  windowRef.on('closed', () => {
    clearWindowRef();
  });
}

module.exports = {
  tryBringExistingWindow,
  attachClearOnClosed,
};
