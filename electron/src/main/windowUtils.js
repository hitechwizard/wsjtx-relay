const { BrowserWindow } = require('electron');

function bringWindowToFront(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }

  if (!targetWindow.isVisible()) {
    targetWindow.show();
  }

  targetWindow.moveTop();
  targetWindow.focus();
}

function hardenWindowNavigation(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed() || !targetWindow.webContents) {
    return;
  }

  targetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  targetWindow.webContents.on('will-navigate', (event, url) => {
    const normalizedUrl = String(url || '');
    if (!normalizedUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });
}

function getValidWindows(windowRefs) {
  if (!Array.isArray(windowRefs)) {
    return [];
  }

  return windowRefs.filter((windowRef) => windowRef && !windowRef.isDestroyed() && windowRef.webContents);
}

function sendToWindows(windowRefs, channel, payload) {
  getValidWindows(windowRefs).forEach((windowRef) => {
    windowRef.webContents.send(channel, payload);
  });
}

function sendToAllWindows(channel, payload) {
  BrowserWindow.getAllWindows().forEach((windowRef) => {
    if (!windowRef || windowRef.isDestroyed() || !windowRef.webContents) {
      return;
    }

    windowRef.webContents.send(channel, payload);
  });
}

module.exports = {
  bringWindowToFront,
  hardenWindowNavigation,
  getValidWindows,
  sendToWindows,
  sendToAllWindows,
};
