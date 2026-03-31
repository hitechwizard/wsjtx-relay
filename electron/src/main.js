const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs');
const dns = require('dns');
const https = require('https');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const WSJTXRelay = require('./relay');
const {
  UPDATE_CHECK_INTERVAL_MS,
  INTERNET_CHECK_TIMEOUT_MS,
  POTA_SPOTS_URL,
  POTA_REQUEST_TIMEOUT_MS,
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
const { sortQsosForStorage } = require('./main/qsoSortUtils');
const {
  hasNewerUpdateAvailable,
  getUpdateBadgeState,
} = require('./main/updateBadgeUtils');
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
const { maybeEnrichQsoFromPotaSpotMap: maybeEnrichQsoWithPotaMap } = require('./main/potaEnrichmentService');
const { bindRelayEventForwarding } = require('./main/relayEventBindings');
const { attachThemeOnLoad } = require('./main/windowThemeUtils');
const { attachPersistBoundsOnClose } = require('./main/windowBoundsUtils');
const { DEFAULT_ACTIVITY_PACKET_FILTERS, readSettingsSnapshot } = require('./main/settingsSnapshot');
const { updateQsoAtIndex, deleteQsoAtIndex } = require('./main/qsoStoreUtils');
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
const { registerRelayHandlers } = require('./main/ipc/relayHandlers');
const { registerAdifHandlers } = require('./main/ipc/adifHandlers');
const { registerUiCommandHandlers } = require('./main/ipc/uiCommandHandlers');
const { registerAllIpcHandlers } = require('./main/ipc/registerAllHandlers');
const { buildHandlerRegistrationOptions } = require('./main/ipc/buildHandlerRegistrationOptions');
const { createRelayInstance } = require('./main/relayFactory');
const { createActivityLogSender, createPotaRequestFailureLogger, createPotaSpotsFetcher } = require('./main/potaRequestUtils');
const { createEnsureRelayInitialized } = require('./main/ensureRelayInitializedFactory');
const {
  createExamplesWindowFactory,
  createMainWindowFactory,
  createSettingsWindowFactory,
  createQsoEditorWindowFactory,
  createPotaSpotsWindowFactory,
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
const { preloadPath, mainHtmlPath, exampleHtmlPath, settingsHtmlPath, qsoEditorHtmlPath, potaSpotsHtmlPath } =
  getUiPaths(__dirname);
const fetchPotaSpots = createPotaSpotsFetcher(
  fetchPotaSpotsFromApi,
  https,
  POTA_SPOTS_URL,
  POTA_REQUEST_TIMEOUT_MS,
);

const store = new Store({
  defaults: getStoreDefaults(DEFAULT_ACTIVITY_PACKET_FILTERS),
});

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

// IPC Handlers
registerAllIpcHandlers(
  buildHandlerRegistrationOptions({
    registerSettingsHandlers,
    registerRelayHandlers,
    registerQsoHandlers,
    registerAdifHandlers,
    registerPotaHandlers,
    registerUiCommandHandlers,
    ipcMain,
    store,
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
    ensureRelayInitialized,
    stopRelayIfRunning,
    sanitizeQsoArray,
    sortQsosForStorage,
    maybeEnrichQsoWithPotaMap,
    fetchPotaSpots,
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
    getMainWindow: appState.getMainWindow,
    restoreAndFocusWindow,
    getPotaSpotsWindow: appState.getPotaSpotsWindow,
    openSettings: createSettingsWindow,
    closeSettings: () => {
      closeWindowAndClearRef(
        appState.getSettingsWindow,
        () => appState.setSettingsWindow(null),
      );
    },
    openQsoEditor: createQsoEditorWindow,
    closeQsoEditor: () => {
      closeWindowAndClearRef(
        appState.getQsoEditorWindow,
        () => appState.setQsoEditorWindow(null),
      );
    },
    openPotaSpots: createPotaSpotsWindow,
    closePotaSpots: () => {
      closeWindowAndClearRef(
        appState.getPotaSpotsWindow,
        () => appState.setPotaSpotsWindow(null),
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
    createExamplesWindow,
    handleWindowAllClosed,
    processPlatform: process.platform,
    handleAppActivate,
    bringWindowToFront,
    getWindowRefs: appState.getWindowRefs,
    handleProcessExit,
  }),
});
