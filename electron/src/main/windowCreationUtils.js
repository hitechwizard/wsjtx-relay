function createSecureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function applyStoredPosition(windowOptions, bounds) {
  if (typeof bounds?.x === 'number' && typeof bounds?.y === 'number') {
    windowOptions.x = bounds.x;
    windowOptions.y = bounds.y;
  }

  return windowOptions;
}

function attachShowWhenReady(targetWindow) {
  targetWindow.once('ready-to-show', () => {
    targetWindow.show();
  });
}

function clampWindowSize(bounds, {
  defaultWidth,
  defaultHeight,
  minWidth,
  minHeight,
}) {
  const width = Math.max(bounds?.width || defaultWidth, minWidth);
  const height = Math.max(bounds?.height || defaultHeight, minHeight);

  return { width, height };
}

module.exports = {
  createSecureWebPreferences,
  applyStoredPosition,
  attachShowWhenReady,
  clampWindowSize,
};
