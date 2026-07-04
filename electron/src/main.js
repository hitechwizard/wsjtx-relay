const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs');
const dns = require('dns');
const https = require('https');
const ElectronStore = require('electron-store');
const Store = ElectronStore.default || ElectronStore;
const { autoUpdater } = require('electron-updater');
const WSJTXRelay = require('./relay');
const {
  UPDATE_CHECK_INTERVAL_MS,
  INTERNET_CHECK_TIMEOUT_MS,
  POTA_SPOTS_URL,
  POTA_REQUEST_TIMEOUT_MS,
  DX_SUMMIT_SPOTS_URL,
  DX_SUMMIT_REQUEST_TIMEOUT_MS,
  SETTINGS_WINDOW_DEFAULT_WIDTH,
  SETTINGS_WINDOW_DEFAULT_HEIGHT,
  SETTINGS_WINDOW_MIN_WIDTH,
  SETTINGS_WINDOW_MIN_HEIGHT,
  ALLOWED_THEMES,
  getAppIconPath,
  getUiPaths,
  getStoreDefaults,
} = require('./main/mainConfig');
const { createAppState } = require('./main/appState');
const {
  bringWindowToFront,
  hardenWindowNavigation,
  sendToWindows,
  sendToAllWindows,
} = require('./main/windowUtils');
const {
  isPlainObject,
  toClampedInteger,
  toNonNegativeNumber,
  sanitizeForwards,
  sanitizeQsoArray,
} = require('./main/validation');
const {
  fetchPotaSpots: fetchPotaSpotsFromApi,
  enrichQsoWithPotaSpot,
  shouldPopulateManualQsoForSpot,
} = require('./main/potaSpotsService');
const {
  fetchDxSummitSpots: fetchDxSummitSpotsFromApi,
  shouldPopulateManualQsoForDxSpot,
} = require('./main/dxSummitSpotsService');
const { sortQsosForStorage } = require('./main/qsoSortUtils');
const { hasNewerUpdateAvailable, getUpdateBadgeState } = require('./main/updateBadgeUtils');
const { hasInternetConnectivity } = require('./main/connectivityUtils');
const {
  showInstallDownloadedUpdatePrompt,
  showDownloadAvailableUpdatePrompt,
  showUpdateDownloadNoInternet,
  showUpdateDownloadFailed,
  showCheckForUpdatesCurrentVersion,
  showCheckForUpdatesPackagedOnly,
  showCheckForUpdatesInProgress,
  showCheckForUpdatesNoInternet,
  showCheckForUpdatesFailed,
} = require('./main/updatePrompts');
const { createUpdateController } = require('./main/updateController');
const {
  maybeEnrichQsoFromPotaSpotMap: maybeEnrichQsoWithPotaMap,
} = require('./main/potaEnrichmentService');
const { bindRelayEventForwarding } = require('./main/relayEventBindings');
const { attachThemeOnLoad } = require('./main/windowThemeUtils');
const { attachPersistBoundsOnClose } = require('./main/windowBoundsUtils');
const {
  DEFAULT_ACTIVITY_PACKET_FILTERS,
  readSettingsSnapshot,
} = require('./main/settingsSnapshot');
const { updateQsoAtIndex, deleteQsoAtIndex } = require('./main/qsoStoreUtils');
const { createQsoStore } = require('./main/qsoFileStore');
const { validateForwardHostLookup } = require('./main/hostValidationService');
const { buildApplicationMenuTemplate } = require('./main/menuTemplate');
const { stopRelayIfRunning, resendViaRelay } = require('./main/relayRuntimeUtils');
const { closeWindowAndClearRef } = require('./main/windowIpcUtils');
const {
  handleAppActivate,
  handleWindowAllClosed,
  handleProcessExit,
} = require('./main/lifecycleUtils');
const { buildUpdateControllerConfig } = require('./main/updateControllerConfig');
const { restoreAndFocusWindow } = require('./main/windowFocusUtils');
const { registerSettingsHandlers } = require('./main/ipc/settingsHandlers');
const { registerQsoHandlers } = require('./main/ipc/qsoHandlers');
const { registerPotaHandlers } = require('./main/ipc/potaHandlers');
const { registerDxSummitHandlers } = require('./main/ipc/dxSummitHandlers');
const { registerRelayHandlers } = require('./main/ipc/relayHandlers');
const { registerAdifHandlers } = require('./main/ipc/adifHandlers');
const { registerUiCommandHandlers } = require('./main/ipc/uiCommandHandlers');
const { registerAllIpcHandlers } = require('./main/ipc/registerAllHandlers');
const { buildHandlerRegistrationOptions } = require('./main/ipc/buildHandlerRegistrationOptions');
const { createRelayInstance } = require('./main/relayFactory');
const {
  createActivityLogSender,
  createPotaRequestFailureLogger,
  createPotaSpotsFetcher,
} = require('./main/potaRequestUtils');
const { createEnsureRelayInitialized } = require('./main/ensureRelayInitializedFactory');
const { createFlrigMonitor, parseFlrigEndpoint } = require('./main/flrigMonitorService');
const {
  createExamplesWindowFactory,
  createMainWindowFactory,
  createSettingsWindowFactory,
  createQsoEditorWindowFactory,
  createPotaSpotsWindowFactory,
  createDxSummitSpotsWindowFactory,
} = require('./main/windowFactories');
const { registerLifecycleHandlers } = require('./main/registerLifecycleHandlers');
const {
  applyStoredPosition,
  attachShowWhenReady,
  clampWindowSize,
} = require('./main/windowCreationUtils');
const { startRelayIfEnabled, setupApplicationMenu } = require('./main/appReadyUtils');
const { attachClearOnClosed } = require('./main/windowInstanceUtils');
const { buildLifecycleHandlerCallbacks } = require('./main/buildLifecycleHandlerCallbacks');

const isMac = process.platform === 'darwin';
const appState = createAppState();
const APP_ICON_PATH = getAppIconPath(__dirname, process.platform);
const {
  preloadPath,
  mainHtmlPath,
  exampleHtmlPath,
  settingsHtmlPath,
  qsoEditorHtmlPath,
  potaSpotsHtmlPath,
  dxSummitSpotsHtmlPath,
} = getUiPaths(__dirname);
const fetchPotaSpots = createPotaSpotsFetcher(
  fetchPotaSpotsFromApi,
  https,
  POTA_SPOTS_URL,
  POTA_REQUEST_TIMEOUT_MS,
);
const fetchDxSummitSpots = () =>
  fetchDxSummitSpotsFromApi(fetch, DX_SUMMIT_SPOTS_URL, DX_SUMMIT_REQUEST_TIMEOUT_MS);

const sendStatusUpdateToWindows = (statusData) => {
  sendToWindows(
    [appState.getMainWindow(), appState.getPotaSpotsWindow(), appState.getDxSummitSpotsWindow()],
    'relay-status-update',
    statusData,
  );
};

const store = new Store({
  defaults: getStoreDefaults(DEFAULT_ACTIVITY_PACKET_FILTERS),
});
const qsoStore = createQsoStore(Store, store);
const flrigMonitor = createFlrigMonitor({
  store,
  onStatusUpdate: sendStatusUpdateToWindows,
  onError: (message) => {
    const mainWindow = appState.getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-error', message);
  },
  onDebugLog: (message) => {
    const mainWindow = appState.getMainWindow();
    mainWindow && mainWindow.webContents.send('relay-log', message);
  },
});
appState.setFlrigMonitor(flrigMonitor);

const logToActivityLog = createActivityLogSender(appState.getMainWindow);
const logPotaRequestFailure = createPotaRequestFailureLogger(appState.getMainWindow);
const ensureRelayInitialized = createEnsureRelayInitialized({
  getRelay: appState.getRelay,
  setRelay: appState.setRelay,
  store,
  WSJTXRelay,
  createRelayInstance,
  bindRelayEventForwarding,
  getMainWindow: appState.getMainWindow,
  getPotaSpotsWindow: appState.getPotaSpotsWindow,
  getDxSummitSpotsWindow: appState.getDxSummitSpotsWindow,
  sendToWindows,
});

const createExamplesWindow = createExamplesWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachClearOnClosed,
  attachShowWhenReady,
  bringWindowToFront,
  getExamplesWindow: appState.getExamplesWindow,
  setExamplesWindow: appState.setExamplesWindow,
  exampleHtmlPath,
});

const createWindow = createMainWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachPersistBoundsOnClose,
  attachClearOnClosed,
  getMainWindowBounds: () => store.get('windowBounds'),
  onMainWindowDidFinishLoad: () => {
    const updateController = appState.getUpdateController();
    updateController && updateController.sendUpdateBadgeState();
  },
  setMainWindow: appState.setMainWindow,
  mainHtmlPath,
  store,
});

const createSettingsWindow = createSettingsWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachPersistBoundsOnClose,
  attachClearOnClosed,
  attachShowWhenReady,
  bringWindowToFront,
  clampWindowSize,
  applyStoredPosition,
  getSettingsWindow: appState.getSettingsWindow,
  setSettingsWindow: appState.setSettingsWindow,
  getSettingsWindowBounds: () =>
    store.get('settingsWindowBounds', {
      width: SETTINGS_WINDOW_DEFAULT_WIDTH,
      height: SETTINGS_WINDOW_DEFAULT_HEIGHT,
    }),
  getMainWindow: appState.getMainWindow,
  settingsHtmlPath,
  store,
  settingsWindowDefaultWidth: SETTINGS_WINDOW_DEFAULT_WIDTH,
  settingsWindowDefaultHeight: SETTINGS_WINDOW_DEFAULT_HEIGHT,
  settingsWindowMinWidth: SETTINGS_WINDOW_MIN_WIDTH,
  settingsWindowMinHeight: SETTINGS_WINDOW_MIN_HEIGHT,
});

const createQsoEditorWindow = createQsoEditorWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachPersistBoundsOnClose,
  attachClearOnClosed,
  attachShowWhenReady,
  bringWindowToFront,
  applyStoredPosition,
  getQsoEditorWindow: appState.getQsoEditorWindow,
  setQsoEditorWindow: appState.setQsoEditorWindow,
  getQsoEditorWindowBounds: () => store.get('qsoEditorWindowBounds', { width: 1000, height: 700 }),
  getMainWindow: appState.getMainWindow,
  qsoEditorHtmlPath,
  store,
});

const createPotaSpotsWindow = createPotaSpotsWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachPersistBoundsOnClose,
  attachClearOnClosed,
  attachShowWhenReady,
  bringWindowToFront,
  applyStoredPosition,
  getPotaSpotsWindow: appState.getPotaSpotsWindow,
  setPotaSpotsWindow: appState.setPotaSpotsWindow,
  getPotaSpotsWindowBounds: () => store.get('potaSpotsWindowBounds', { width: 1400, height: 700 }),
  potaSpotsHtmlPath,
  store,
});

const createDxSummitSpotsWindow = createDxSummitSpotsWindowFactory({
  BrowserWindow,
  appIconPath: APP_ICON_PATH,
  preloadPath,
  hardenWindowNavigation,
  attachThemeOnLoad,
  getTheme: () => store.get('theme', 'light'),
  attachPersistBoundsOnClose,
  attachClearOnClosed,
  attachShowWhenReady,
  bringWindowToFront,
  applyStoredPosition,
  getDxSummitSpotsWindow: appState.getDxSummitSpotsWindow,
  setDxSummitSpotsWindow: appState.setDxSummitSpotsWindow,
  getDxSummitSpotsWindowBounds: () =>
    store.get('dxSummitSpotsWindowBounds', { width: 1400, height: 700 }),
  dxSummitSpotsHtmlPath,
  store,
});

// IPC Handlers
registerAllIpcHandlers(
  buildHandlerRegistrationOptions({
    registerSettingsHandlers,
    registerRelayHandlers,
    registerQsoHandlers,
    registerAdifHandlers,
    registerPotaHandlers,
    registerDxSummitHandlers,
    registerUiCommandHandlers,
    ipcMain,
    store,
    qsoStore,
    getRelay: appState.getRelay,
    fetchImpl: fetch,
    isPlainObject,
    toClampedInteger,
    toNonNegativeNumber,
    sanitizeForwards,
    allowedThemes: ALLOWED_THEMES,
    sendToAllWindows,
    readSettingsSnapshot,
    dns,
    validateForwardHostLookup,
    parseFlrigEndpoint,
    onSettingsSaved: (updatedSettings) => {
      flrigMonitor.applySettings({
        nextEnabled: updatedSettings.flrigEnabled,
        nextEndpoint: updatedSettings.flrigEndpoint,
      });
    },
    ensureRelayInitialized,
    stopRelayIfRunning,
    sanitizeQsoArray,
    sortQsosForStorage,
    maybeEnrichQsoWithPotaMap,
    fetchPotaSpots,
    fetchDxSummitSpots,
    enrichQsoWithPotaSpot,
    logPotaRequestFailure,
    logToActivityLog,
    updateQsoAtIndex,
    deleteQsoAtIndex,
    resendViaRelay,
    dialog,
    getQsoEditorWindow: appState.getQsoEditorWindow,
    fsPromises: fs.promises,
    BrowserWindow,
    shouldPopulateManualQsoForSpot,
    shouldPopulateManualQsoForDxSpot,
    getMainWindow: appState.getMainWindow,
    restoreAndFocusWindow,
    getPotaSpotsWindow: appState.getPotaSpotsWindow,
    getDxSummitSpotsWindow: appState.getDxSummitSpotsWindow,
    openSettings: createSettingsWindow,
    closeSettings: () => {
      closeWindowAndClearRef(appState.getSettingsWindow, () => appState.setSettingsWindow(null));
    },
    openQsoEditor: createQsoEditorWindow,
    closeQsoEditor: () => {
      closeWindowAndClearRef(appState.getQsoEditorWindow, () => appState.setQsoEditorWindow(null));
    },
    openPotaSpots: createPotaSpotsWindow,
    openDxSummitSpots: createDxSummitSpotsWindow,
    closePotaSpots: () => {
      closeWindowAndClearRef(appState.getPotaSpotsWindow, () => appState.setPotaSpotsWindow(null));
    },
    closeDxSummitSpots: () => {
      closeWindowAndClearRef(appState.getDxSummitSpotsWindow, () =>
        appState.setDxSummitSpotsWindow(null),
      );
    },
    sendToWindows,
    performUpdateAction: async () => {
      const updateController = appState.getUpdateController();
      if (updateController) {
        await updateController.performUpdateAction();
      }
    },
  }),
);

registerLifecycleHandlers({
  app,
  processModule: process,
  ...buildLifecycleHandlerCallbacks({
    createUpdateController,
    buildUpdateControllerConfig,
    updateControllerState: {
      get: appState.getUpdateController,
      set: appState.setUpdateController,
    },
    app,
    autoUpdater,
    dialog,
    dns,
    getMainWindow: appState.getMainWindow,
    hasInternetConnectivity,
    hasNewerUpdateAvailable,
    getUpdateBadgeState,
    showInstallDownloadedUpdatePrompt,
    showDownloadAvailableUpdatePrompt,
    showUpdateDownloadNoInternet,
    showUpdateDownloadFailed,
    showCheckForUpdatesCurrentVersion,
    showCheckForUpdatesPackagedOnly,
    showCheckForUpdatesInProgress,
    showCheckForUpdatesNoInternet,
    showCheckForUpdatesFailed,
    updateCheckIntervalMs: UPDATE_CHECK_INTERVAL_MS,
    internetCheckTimeoutMs: INTERNET_CHECK_TIMEOUT_MS,
    createWindow,
    startRelayIfEnabled,
    store,
    ensureRelayInitialized,
    setupApplicationMenu,
    Menu,
    buildApplicationMenuTemplate,
    isMac,
    stopRelayIfRunning,
    getRelay: appState.getRelay,
    createSettingsWindow,
    createQsoEditorWindow,
    createPotaSpotsWindow,
    createDxSummitSpotsWindow,
    createExamplesWindow,
    stopFlrigMonitor: () => {
      const monitor = appState.getFlrigMonitor();
      monitor && monitor.dispose();
    },
    handleWindowAllClosed,
    processPlatform: process.platform,
    handleAppActivate,
    bringWindowToFront,
    getWindowRefs: appState.getWindowRefs,
    handleProcessExit,
  }),
});

app.on('ready', () => {
  const monitor = appState.getFlrigMonitor();
  monitor && monitor.refreshFromStore();
});
