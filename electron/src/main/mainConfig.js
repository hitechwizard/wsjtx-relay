const path = require('path');

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INTERNET_CHECK_TIMEOUT_MS = 3000;
const POTA_SPOTS_URL = 'https://api.pota.app/spot/activator';
const POTA_REQUEST_TIMEOUT_MS = 5000;
const DX_SUMMIT_SPOTS_URL = 'http://www.dxsummit.fi/api/v1/spots';
const DX_SUMMIT_REQUEST_TIMEOUT_MS = 5000;
const SETTINGS_WINDOW_DEFAULT_WIDTH = 1100;
const SETTINGS_WINDOW_DEFAULT_HEIGHT = 760;
const SETTINGS_WINDOW_MIN_WIDTH = 980;
const SETTINGS_WINDOW_MIN_HEIGHT = 620;
const ALLOWED_THEMES = new Set(['light', 'dark']);

function getAppIconPath(dirname, platform) {
  return path.join(dirname, platform === 'win32' ? '../assets/icon.ico' : '../assets/icon.png');
}

function getUiPaths(dirname) {
  return {
    preloadPath: path.join(dirname, 'preload.js'),
    mainHtmlPath: path.join(dirname, '../ui/index.html'),
    exampleHtmlPath: path.join(dirname, '../ui/example.html'),
    settingsHtmlPath: path.join(dirname, '../ui/settings.html'),
    qsoEditorHtmlPath: path.join(dirname, '../ui/qso-editor.html'),
    potaSpotsHtmlPath: path.join(dirname, '../ui/pota-spots.html'),
    dxSummitSpotsHtmlPath: path.join(dirname, '../ui/dx-summit-spots.html'),
  };
}

function getStoreDefaults(defaultActivityPacketFilters) {
  return {
    listenPort: 2237,
    forwards: [],
    flrigEnabled: false,
    flrigEndpoint: '127.0.0.1:12345',
    defaultMyCall: '',
    defaultMyGrid: '',
    autoStartRelay: false,
    usePotaSpotMap: false,
    qrzLoggingEnabled: false,
    qrzApiKey: '',
    clublogLoggingEnabled: false,
    clublogCallsign: '',
    clublogPassword: '',
    clublogEmail: '',
    forwardDelaySeconds: 0.5,
    decodeSightingExpirationMinutes: 5,
    manualQsoEntryType: 'pota',
    activityPacketFilters: [...defaultActivityPacketFilters],
    theme: 'light',
    windowBounds: { width: 1200, height: 800 },
    settingsWindowBounds: {
      width: SETTINGS_WINDOW_DEFAULT_WIDTH,
      height: SETTINGS_WINDOW_DEFAULT_HEIGHT,
    },
    qsoEditorWindowBounds: { width: 1000, height: 700 },
    potaSpotsWindowBounds: { width: 1400, height: 700 },
    dxSummitSpotsWindowBounds: { width: 1400, height: 700 },
    potaSpotsFilters: {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      hideWorked: false,
      hideQrt: false,
    },
    dxSummitSpotsFilters: {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      callFilter: '',
      hideWorked: false,
      hideQrt: false,
    },
    dxSummitWorkedMatchFields: ['call', 'band', 'mode', 'date'],
  };
}

module.exports = {
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
};
