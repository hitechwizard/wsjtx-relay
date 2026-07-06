function createExamplesWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachClearOnClosed,
    attachShowWhenReady,
    bringWindowToFront,
    getExamplesWindow,
    setExamplesWindow,
    exampleHtmlPath,
  } = options;

  return function createExamplesWindow() {
    const currentWindow = getExamplesWindow();
    if (currentWindow) {
      bringWindowToFront(currentWindow);
      return;
    }

    const nextWindow = new BrowserWindow({
      width: 1200,
      height: 860,
      show: false,
      icon: appIconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    setExamplesWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(exampleHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    attachClearOnClosed(nextWindow, () => {
      setExamplesWindow(null);
    });

    attachShowWhenReady(nextWindow);
  };
}

function createMainWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachPersistBoundsOnClose,
    attachClearOnClosed,
    getMainWindowBounds,
    onMainWindowDidFinishLoad,
    setMainWindow,
    mainHtmlPath,
    store,
  } = options;

  return function createWindow() {
    const bounds = getMainWindowBounds();

    const nextWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      icon: appIconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    setMainWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(mainHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    nextWindow.webContents.on('did-finish-load', () => {
      onMainWindowDidFinishLoad();
    });

    attachPersistBoundsOnClose(nextWindow, store, 'windowBounds');

    attachClearOnClosed(nextWindow, () => {
      setMainWindow(null);
    });
  };
}

function createSettingsWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachPersistBoundsOnClose,
    attachClearOnClosed,
    attachShowWhenReady,
    bringWindowToFront,
    clampWindowSize,
    applyStoredPosition,
    getSettingsWindow,
    setSettingsWindow,
    getSettingsWindowBounds,
    getMainWindow,
    settingsHtmlPath,
    store,
    settingsWindowDefaultWidth,
    settingsWindowDefaultHeight,
    settingsWindowMinWidth,
    settingsWindowMinHeight,
  } = options;

  return function createSettingsWindow() {
    const currentWindow = getSettingsWindow();
    if (currentWindow) {
      bringWindowToFront(currentWindow);
      return;
    }

    const bounds = getSettingsWindowBounds();
    const { width, height } = clampWindowSize(bounds, {
      defaultWidth: settingsWindowDefaultWidth,
      defaultHeight: settingsWindowDefaultHeight,
      minWidth: settingsWindowMinWidth,
      minHeight: settingsWindowMinHeight,
    });

    const windowOptions = applyStoredPosition(
      {
        width,
        height,
        minWidth: settingsWindowMinWidth,
        minHeight: settingsWindowMinHeight,
        parent: getMainWindow(),
        modal: true,
        show: false,
        icon: appIconPath,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
      bounds,
    );

    const nextWindow = new BrowserWindow(windowOptions);
    setSettingsWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(settingsHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    attachClearOnClosed(nextWindow, () => {
      setSettingsWindow(null);
    });

    attachPersistBoundsOnClose(nextWindow, store, 'settingsWindowBounds');

    nextWindow.on('resize', () => {
      const activeWindow = getSettingsWindow();
      if (!activeWindow) {
        return;
      }

      const [currentWidth, currentHeight] = activeWindow.getSize();
      const clampedWidth = Math.max(currentWidth, settingsWindowMinWidth);
      const clampedHeight = Math.max(currentHeight, settingsWindowMinHeight);

      if (currentWidth !== clampedWidth || currentHeight !== clampedHeight) {
        activeWindow.setSize(clampedWidth, clampedHeight);
      }
    });

    attachShowWhenReady(nextWindow);
  };
}

function createQsoEditorWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachPersistBoundsOnClose,
    attachClearOnClosed,
    attachShowWhenReady,
    bringWindowToFront,
    applyStoredPosition,
    getQsoEditorWindow,
    setQsoEditorWindow,
    getQsoEditorWindowBounds,
    getMainWindow,
    qsoEditorHtmlPath,
    store,
  } = options;

  return function createQsoEditorWindow() {
    const currentWindow = getQsoEditorWindow();
    if (currentWindow) {
      bringWindowToFront(currentWindow);
      return;
    }

    const bounds = getQsoEditorWindowBounds();

    const windowOptions = applyStoredPosition(
      {
        width: bounds.width,
        height: bounds.height,
        parent: getMainWindow(),
        modal: true,
        show: false,
        icon: appIconPath,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
      bounds,
    );

    const nextWindow = new BrowserWindow(windowOptions);
    setQsoEditorWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(qsoEditorHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    attachClearOnClosed(nextWindow, () => {
      setQsoEditorWindow(null);
    });

    attachPersistBoundsOnClose(nextWindow, store, 'qsoEditorWindowBounds');

    attachShowWhenReady(nextWindow);
  };
}

function createPotaSpotsWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachPersistBoundsOnClose,
    attachClearOnClosed,
    attachShowWhenReady,
    bringWindowToFront,
    applyStoredPosition,
    getPotaSpotsWindow,
    setPotaSpotsWindow,
    getPotaSpotsWindowBounds,
    potaSpotsHtmlPath,
    store,
  } = options;

  return function createPotaSpotsWindow() {
    const currentWindow = getPotaSpotsWindow();
    if (currentWindow) {
      bringWindowToFront(currentWindow);
      return;
    }

    const bounds = getPotaSpotsWindowBounds();

    const windowOptions = applyStoredPosition(
      {
        width: bounds.width,
        height: bounds.height,
        show: false,
        icon: appIconPath,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
      bounds,
    );

    const nextWindow = new BrowserWindow(windowOptions);
    setPotaSpotsWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(potaSpotsHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    attachClearOnClosed(nextWindow, () => {
      setPotaSpotsWindow(null);
    });

    attachPersistBoundsOnClose(nextWindow, store, 'potaSpotsWindowBounds');

    attachShowWhenReady(nextWindow);
  };
}

function createDxSummitSpotsWindowFactory(options) {
  const {
    BrowserWindow,
    appIconPath,
    preloadPath,
    hardenWindowNavigation,
    attachThemeOnLoad,
    getTheme,
    attachPersistBoundsOnClose,
    attachClearOnClosed,
    attachShowWhenReady,
    bringWindowToFront,
    applyStoredPosition,
    getDxSummitSpotsWindow,
    setDxSummitSpotsWindow,
    getDxSummitSpotsWindowBounds,
    dxSummitSpotsHtmlPath,
    store,
  } = options;

  return function createDxSummitSpotsWindow() {
    const currentWindow = getDxSummitSpotsWindow();
    if (currentWindow) {
      bringWindowToFront(currentWindow);
      return;
    }

    const bounds = getDxSummitSpotsWindowBounds();

    const windowOptions = applyStoredPosition(
      {
        width: bounds.width,
        height: bounds.height,
        show: false,
        icon: appIconPath,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
      bounds,
    );

    const nextWindow = new BrowserWindow(windowOptions);
    setDxSummitSpotsWindow(nextWindow);

    hardenWindowNavigation(nextWindow);
    nextWindow.loadFile(dxSummitSpotsHtmlPath);

    attachThemeOnLoad(nextWindow, getTheme);

    attachClearOnClosed(nextWindow, () => {
      setDxSummitSpotsWindow(null);
    });

    attachPersistBoundsOnClose(nextWindow, store, 'dxSummitSpotsWindowBounds');

    attachShowWhenReady(nextWindow);
  };
}

module.exports = {
  createExamplesWindowFactory,
  createMainWindowFactory,
  createSettingsWindowFactory,
  createQsoEditorWindowFactory,
  createPotaSpotsWindowFactory,
  createDxSummitSpotsWindowFactory,
};
