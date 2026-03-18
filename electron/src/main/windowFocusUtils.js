function restoreAndFocusWindow(windowRef) {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  if (windowRef.isMinimized()) {
    windowRef.restore();
  }

  windowRef.focus();
}

module.exports = {
  restoreAndFocusWindow,
};
