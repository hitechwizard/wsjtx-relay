const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const settingsBtn = document.getElementById('settingsBtn');
const updateBadgeBtn = document.getElementById('updateBadgeBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const clearQsoBtn = document.getElementById('clearQsoBtn');
const qsoEditorBtn = document.getElementById('qsoEditorBtn');
const statusBadge = document.getElementById('statusBadge');
const logContainer = document.getElementById('logContainer');
const qsoContainer = document.getElementById('qsoContainer');
const qsoCount = document.getElementById('qsoCount');
const qsoTodayUtc = document.getElementById('qsoTodayUtc');
const qsoLastHour = document.getElementById('qsoLastHour');
const activityRxIndicator = document.getElementById('activityRxIndicator');
const qsoFilterCall = document.getElementById('qsoFilterCall');
const activityPacketFilters = document.querySelectorAll('.activity-packet-filter');
const listenPortValue = document.getElementById('listenPortValue');
const forwardsValue = document.getElementById('forwardsValue');
const themeToggle = document.getElementById('themeToggle');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const appLogo = document.getElementById('appLogo');
const frequencyValue = document.getElementById('frequencyValue');
const modeValue = document.getElementById('modeValue');
const txEnabledValue = document.getElementById('txEnabledValue');
const transmittingValue = document.getElementById('transmittingValue');
const transmitMessage = document.getElementById('transmitMessage');

const qsoFrequency = document.getElementById('qso-frequency');
const qsoBand = document.getElementById('qso-band');
const qsoLogContactBtn = document.getElementById('qsoLogContact');
const qsoTimeNowBtn = document.getElementById('qsoTimeNow');
const qsoDateOn = document.getElementById('qso-dateon');
const qsoTimeOn = document.getElementById('qso-timeon');
const qsoDxCallInput = document.getElementById('qso-dxcall');
const qsoRstSentInput = document.getElementById('qso-rst');
const qsoRstRcvdInput = document.getElementById('qso-rcvd');
const deCall = document.getElementById('deCall');
const deGrid = document.getElementById('deGrid');
const manualQsoSection = document.getElementById('manualQsoSection');
const statusIndicatorsSection = document.getElementById('statusIndicatorsSection');
const toggleManualQsoBtn = document.getElementById('toggleManualQsoBtn');
const toggleStatusIndicatorsBtn = document.getElementById('toggleStatusIndicatorsBtn');

let relayRunning = false;
let qsoList = [];
let currentQsoCallFilter = '';
let selectedActivityPacketTypes = new Set();
let isBulkQsoRender = false;
let activityPacketFilterSaveTimer = null;
let activityRxBlinkTimer = null;
const subscriptionDisposers = [];

function addSubscriptionDisposer(disposer) {
  if (typeof disposer === 'function') {
    subscriptionDisposers.push(disposer);
  }
}

function disposeSubscriptions() {
  while (subscriptionDisposers.length > 0) {
    const disposer = subscriptionDisposers.pop();
    try {
      disposer();
    } catch (error) {
      console.error('Failed to dispose renderer subscription:', error);
    }
  }
}

const LOG_PACKET_TYPES = ['Heartbeat', 'Status', 'Decode', 'QSO Logged', 'Logged ADIF'];
const DEFAULT_ACTIVITY_PACKET_FILTERS = [...LOG_PACKET_TYPES, 'SYSTEM'];

const APP_LOGO_SVG = `
  <svg viewBox="0 0 460 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6" fill="currentColor" />
        </marker>
      </defs>

      <text x="0" y="31" fill="currentColor" font-size="23" font-family="Segoe UI, sans-serif" font-weight="900">WSJT-X</text>
      <line x1="92" y1="24" x2="154" y2="24" stroke="currentColor" stroke-width="2.3" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"/>
      <text x="166" y="31" fill="currentColor" font-size="24" font-family="Segoe UI, sans-serif" font-weight="900">Relay</text>

      <line class="logo-accent" x1="246" y1="8" x2="328" y2="8" stroke="currentColor" stroke-width="2.2" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"/>
      <line class="logo-accent" x1="246" y1="24" x2="328" y2="24" stroke="currentColor" stroke-width="2.2" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"/>
      <line class="logo-accent" x1="246" y1="40" x2="328" y2="40" stroke="currentColor" stroke-width="2.2" stroke-dasharray="4 3" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"/>

      <rect x="334" y="0" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <rect x="334" y="16" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <rect x="334" y="32" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
    </svg>
`;

const qsoFields = window.wsjtxQsoFields || {};
const freqToBand = window.wsjtxFreqToBand || (() => 'OOB');
const normalizeCalculatedFields = window.wsjtxNormalizeCalculatedFields || (() => {});

if (
  !window.wsjtxQsoFields ||
  typeof window.wsjtxFreqToBand !== 'function' ||
  typeof window.wsjtxNormalizeCalculatedFields !== 'function'
) {
  showSharedConfigWarning();
}

const qsoInputExtractors = {
  call: () => document.getElementById('qso-dxcall')?.value || '',
  mode: () => document.getElementById('qso-mode')?.value || '',
  rst_sent: () => document.getElementById('qso-rst')?.value || '',
  rst_rcvd: () => document.getElementById('qso-rcvd')?.value || '',
  band: () => qsoBand?.value || '',
  freq: () => parseFloat(qsoFrequency?.value) || 0,
  station_callsign: () => document.getElementById('deCall')?.textContent || '',
  tx_pwr: () => document.getElementById('qso-txpwr')?.value || '',
  my_sig_info: () => document.getElementById('qso-mysiginfo')?.value || '',
  sig_info: () => document.getElementById('qso-siginfo')?.value || '',
  comment: () => '',
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadSettings();
  setupEventListeners();
  checkRelayStatus();
});

function setupEventListeners() {
  startBtn.addEventListener('click', startRelay);
  stopBtn.addEventListener('click', stopRelay);
  settingsBtn.addEventListener('click', openSettings);
  if (updateBadgeBtn) {
    updateBadgeBtn.addEventListener('click', async () => {
      try {
        await window.electron.performUpdateAction();
      } catch (err) {
        console.error('Failed to perform update action:', err);
      }
    });
  }
  clearLogBtn.addEventListener('click', clearLog);
  clearQsoBtn.addEventListener('click', clearQsoLog);
  qsoEditorBtn.addEventListener('click', openQsoEditor);
  if (qsoLogContactBtn) qsoLogContactBtn.addEventListener('click', handleQsoLogContact);
  if (qsoTimeNowBtn) qsoTimeNowBtn.addEventListener('click', handleQsoTimeNow);
  [qsoTimeOn, qsoDxCallInput, qsoRstSentInput, qsoRstRcvdInput].forEach((input) => {
    if (input) {
      input.addEventListener('input', updateLogContactButtonState);
      input.addEventListener('change', updateLogContactButtonState);
    }
  });
  if (toggleManualQsoBtn && manualQsoSection) {
    toggleManualQsoBtn.addEventListener('click', () => {
      toggleSectionVisibility(manualQsoSection, toggleManualQsoBtn);
    });
  }
  if (toggleStatusIndicatorsBtn && statusIndicatorsSection) {
    toggleStatusIndicatorsBtn.addEventListener('click', () => {
      toggleSectionVisibility(statusIndicatorsSection, toggleStatusIndicatorsBtn);
    });
  }
  if (qsoFilterCall) {
    qsoFilterCall.addEventListener('input', (e) => {
      currentQsoCallFilter = String(e.target.value || '')
        .trim()
        .toUpperCase();
      applyQsoCallFilter();
      scrollQsoLogToBottom();
    });
  }
  if (activityPacketFilters.length > 0) {
    selectedActivityPacketTypes = getSelectedActivityPacketTypes();
    activityPacketFilters.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        selectedActivityPacketTypes = getSelectedActivityPacketTypes();
        scheduleSaveActivityPacketFilterSettings();
      });
    });
  }
  themeToggle.addEventListener('change', toggleTheme);
  if (themeToggleIcon) {
    themeToggleIcon.addEventListener('click', () => {
      themeToggle.checked = !themeToggle.checked;
      toggleTheme();
    });
  }

  // Uppercase conversion for call and state inputs
  const qsoDxCall = document.getElementById('qso-dxcall');
  const qsoMyState = document.getElementById('qso-mystate');
  const qsoState = document.getElementById('qso-state');
  if (qsoDxCall) {
    qsoDxCall.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  if (qsoMyState) {
    qsoMyState.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  if (qsoState) {
    qsoState.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }

  setupManualFieldValidation();

  // Theme change listener
  addSubscriptionDisposer(window.electron.onThemeChanged((theme) => {
    applyTheme(theme);
  }));

  addSubscriptionDisposer(window.electron.onUpdateBadgeState((state) => {
    applyUpdateBadgeState(state);
  }));

  addSubscriptionDisposer(window.electron.onSettingsChanged((settings) => {
    applySettingsToStatusIndicators(settings);
    if (settings && settings.theme) {
      applyTheme(settings.theme);
    }
  }));

  // QSO data refresh listener
  addSubscriptionDisposer(window.electron.onQsoDataRefresh(() => {
    refreshQsoLog();
  }));

  addSubscriptionDisposer(window.electron.onPotaSpotSelected((spotData) => {
    applySelectedPotaSpotToManualQso(spotData);
  }));

  // Relay events
  addSubscriptionDisposer(window.electron.onRelayLog((msg) => {
    blinkActivityRxIndicator();
    if (!shouldLogPacketMessage(msg)) {
      return;
    }
    addLogEntry(msg, 'normal');
  }));

  addSubscriptionDisposer(window.electron.onRelayStatus((status) => {
    updateStatus(status);
  }));

  addSubscriptionDisposer(window.electron.onRelayError((msg) => {
    addLogEntry(`ERROR: ${msg}`, 'error');
  }));

  addSubscriptionDisposer(window.electron.onRelayDecode((msg) => {
    addLogEntry(msg, 'normal');
  }));

  addSubscriptionDisposer(window.electron.onRelayStatusUpdate((statusData) => {
    updateStatusIndicators(statusData);
  }));

  addSubscriptionDisposer(window.electron.onRelayQsoLogged(async (qso) => {
    applyManualMyParkToLoggedQso(qso);
    normalizeCalculatedFields(qso);
    // Save QSO from relay to persistent storage
    const saveResult = await window.electron.saveQso(qso);
    const persistedQso = saveResult && saveResult.qso ? saveResult.qso : qso;
    if (
      saveResult &&
      saveResult.success &&
      typeof window.electron.notifyQsoDataChanged === 'function'
    ) {
      window.electron.notifyQsoDataChanged();
    }
    normalizeCalculatedFields(persistedQso);
    addQsoEntry(persistedQso, 'normal');
  }));

  window.addEventListener('beforeunload', () => {
    disposeSubscriptions();
  });

  // Update time-based QSO counters every minute
  setInterval(() => {
    updateQsoLastHourCount();
    updateQsoTodayUtcCount();
  }, 60000);

  updateLogContactButtonState();
}

function applySelectedPotaSpotToManualQso(spotData) {
  const selectedSpot = spotData || {};

  const activator = String(selectedSpot.activator || '')
    .trim()
    .toUpperCase();
  const reference = String(selectedSpot.reference || '')
    .trim()
    .toUpperCase();
  const locationDesc = String(selectedSpot.locationDesc || '').trim();
  const stateValue = locationDesc.length >= 2 ? locationDesc.slice(-2).toUpperCase() : '';

  const dxCallInput = document.getElementById('qso-dxcall');
  const theirParkInput = document.getElementById('qso-siginfo');
  const stateInput = document.getElementById('qso-state');

  if (dxCallInput) {
    dxCallInput.value = activator;
  }
  if (theirParkInput) {
    theirParkInput.value = reference;
    theirParkInput.dispatchEvent(new Event('input', { bubbles: true }));
    theirParkInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  if (stateInput) {
    stateInput.value = stateValue;
  }

  updateLogContactButtonState();
}

function blinkActivityRxIndicator() {
  if (!activityRxIndicator) {
    return;
  }

  activityRxIndicator.classList.add('is-active');

  if (activityRxBlinkTimer) {
    clearTimeout(activityRxBlinkTimer);
  }

  activityRxBlinkTimer = setTimeout(() => {
    activityRxIndicator.classList.remove('is-active');
    activityRxBlinkTimer = null;
  }, 180);
}

function updateLogContactButtonState() {
  if (!qsoLogContactBtn) {
    return;
  }

  const hasTimeOn = Boolean((qsoTimeOn?.value || '').trim());
  const hasDxCall = Boolean((qsoDxCallInput?.value || '').trim());
  const hasRstSent = Boolean((qsoRstSentInput?.value || '').trim());
  const hasRstRcvd = Boolean((qsoRstRcvdInput?.value || '').trim());
  const hasDeCall = Boolean((deCall?.textContent || '').trim());
  const hasDeGrid = Boolean((deGrid?.textContent || '').trim());
  const hasFrequency = Boolean((qsoFrequency?.value || '').trim());
  const hasBand = Boolean((qsoBand?.value || '').trim());
  const hasMode = Boolean((document.getElementById('qso-mode')?.value || '').trim());

  qsoLogContactBtn.disabled = !(
    hasTimeOn &&
    hasDxCall &&
    hasRstSent &&
    hasRstRcvd &&
    hasDeCall &&
    hasDeGrid &&
    hasFrequency &&
    hasBand &&
    hasMode
  );
}

function applyUpdateBadgeState(state) {
  if (!updateBadgeBtn) {
    return;
  }

  const visible = Boolean(state && state.visible);
  updateBadgeBtn.hidden = !visible;
  updateBadgeBtn.classList.remove('update-available', 'update-ready');

  if (!visible) {
    return;
  }

  const label =
    typeof state.label === 'string' && state.label.trim() ? state.label : 'Update Available';
  updateBadgeBtn.textContent = label;

  if (state.kind === 'ready') {
    updateBadgeBtn.classList.add('update-ready');
  } else {
    updateBadgeBtn.classList.add('update-available');
  }
}

function detectPacketType(msg) {
  if (typeof msg !== 'string') {
    return null;
  }

  const arrowIndex = msg.indexOf('-> ');
  if (arrowIndex < 0) {
    return null;
  }

  const payload = msg.slice(arrowIndex + 3).trim();
  return LOG_PACKET_TYPES.find((type) => payload.startsWith(type)) || null;
}

function shouldLogPacketMessage(msg) {
  if (selectedActivityPacketTypes.size === 0) {
    return false;
  }

  const packetType = detectPacketType(msg) || 'SYSTEM';
  return selectedActivityPacketTypes.has(packetType);
}

function getSelectedActivityPacketTypes() {
  return new Set(
    Array.from(activityPacketFilters)
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value),
  );
}

function applyActivityPacketFilterSettings(packetFilters) {
  const selected = new Set(
    Array.isArray(packetFilters) && packetFilters.length > 0
      ? packetFilters
      : DEFAULT_ACTIVITY_PACKET_FILTERS,
  );

  activityPacketFilters.forEach((checkbox) => {
    checkbox.checked = selected.has(checkbox.value);
  });

  selectedActivityPacketTypes = getSelectedActivityPacketTypes();
}

function saveActivityPacketFilterSettings() {
  const listenPort = parseInt(listenPortValue.textContent);
  if (Number.isNaN(listenPort)) {
    return;
  }

  window.electron
    .saveSettings({
      listenPort,
      forwards: window.currentForwards || [],
      forwardDelaySeconds: window.currentForwardDelaySeconds ?? 0.5,
      activityPacketFilters: Array.from(selectedActivityPacketTypes),
    })
    .catch((err) => console.error('Error saving activity packet filters:', err));
}

function scheduleSaveActivityPacketFilterSettings() {
  if (activityPacketFilterSaveTimer) {
    clearTimeout(activityPacketFilterSaveTimer);
  }

  activityPacketFilterSaveTimer = setTimeout(() => {
    activityPacketFilterSaveTimer = null;
    saveActivityPacketFilterSettings();
  }, 250);
}

function renderAppLogo() {
  if (appLogo) {
    appLogo.innerHTML = APP_LOGO_SVG;
  }
}

function toggleSectionVisibility(section, toggleButton) {
  section.hidden = !section.hidden;
  toggleButton.textContent = section.hidden ? 'Show' : 'Hide';

  const parentPanel = section.closest('.status-panel');
  if (parentPanel) {
    parentPanel.classList.toggle('section-collapsed', section.hidden);
  }
}

function setupManualFieldValidation() {
  const manualFieldMap = {
    call: 'qso-dxcall',
    sig_info: 'qso-siginfo',
    my_sig_info: 'qso-mysiginfo',
    state: 'qso-state',
    my_state: 'qso-mystate',
  };

  Object.entries(manualFieldMap).forEach(([fieldName, elementId]) => {
    const input = document.getElementById(elementId);
    if (!input) {
      return;
    }

    input.addEventListener('blur', () => {
      const nextValue = preprocessManualFieldValue(fieldName, input.value);
      input.value = nextValue;

      const validationError = validateManualFieldValue(fieldName, nextValue);
      if (validationError) {
        input.setCustomValidity(validationError);
        input.reportValidity();
      } else {
        input.setCustomValidity('');
      }
    });
  });
}

function preprocessManualFieldValue(fieldName, value) {
  let next = String(value || '');

  if (
    fieldName === 'call' ||
    fieldName === 'station_callsign' ||
    fieldName === 'state' ||
    fieldName === 'my_state' ||
    fieldName === 'sig_info' ||
    fieldName === 'my_sig_info'
  ) {
    next = next.toUpperCase().trim();
  }

  if ((fieldName === 'sig_info' || fieldName === 'my_sig_info') && /^[0-9]{4,5}$/.test(next)) {
    next = `US-${next}`;
  }

  return next;
}

function applyManualMyParkToLoggedQso(qso) {
  if (!qso || qso.my_sig || qso.my_sig_info) {
    return;
  }

  const myParkInput = document.getElementById('qso-mysiginfo');
  if (!myParkInput) {
    return;
  }

  const normalizedPark = preprocessManualFieldValue('my_sig_info', myParkInput.value);
  if (!normalizedPark) {
    return;
  }

  const validationError = validateManualFieldValue('my_sig_info', normalizedPark);
  if (validationError) {
    return;
  }

  qso.my_sig_info = normalizedPark;
}

function validateManualFieldValue(fieldName, value) {
  const config = qsoFields[fieldName];
  if (!config || !config.pattern) {
    return null;
  }

  const pattern = new RegExp(config.pattern);
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue || pattern.test(normalizedValue)) {
    return null;
  }

  return `Invalid ${config.label || fieldName} format`;
}

function applySettingsToStatusIndicators(settings) {
  if (!settings) {
    return;
  }

  if (typeof settings.listenPort !== 'undefined') {
    listenPortValue.textContent = settings.listenPort;
  }

  if (Array.isArray(settings.forwards)) {
    window.currentForwards = settings.forwards;
  } else {
    window.currentForwards = [];
  }

  if (
    typeof settings.forwardDelaySeconds === 'number' &&
    Number.isFinite(settings.forwardDelaySeconds)
  ) {
    window.currentForwardDelaySeconds = settings.forwardDelaySeconds;
  }

  if (Array.isArray(settings.activityPacketFilters)) {
    applyActivityPacketFilterSettings(settings.activityPacketFilters);
  }

  const enabledForwards = window.currentForwards.filter((forward) => !forward.disabled);
  if (enabledForwards.length > 0) {
    forwardsValue.textContent = enabledForwards
      .map(
        (forward) =>
          `${forward.host == '127.0.0.1' || forward.host == 'localhost' ? '' : forward.host + ':'}${forward.port}`,
      )
      .join(', ');
  } else {
    forwardsValue.textContent = 'None enabled';
  }
}

async function loadSettings() {
  const settings = await window.electron.getSettings();
  applySettingsToStatusIndicators(settings);
  renderAppLogo();

  // Load and display persisted QSOs
  qsoList = [];
  const qsos = settings.qsos || [];
  isBulkQsoRender = true;
  qsos.forEach((qso) => {
    addQsoEntry(qso, 'normal');
  });
  isBulkQsoRender = false;
  applyQsoCallFilter();
  updateQsoTodayUtcCount();
  updateQsoLastHourCount();
  updateQsoCount();
  scrollQsoLogToBottom();
}

async function loadTheme() {
  const theme = await window.electron.getTheme();
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.checked = true;
    if (themeToggleIcon) {
      themeToggleIcon.textContent = '☀️';
      themeToggleIcon.title = 'Switch to light theme';
    }
  } else {
    document.body.classList.remove('dark-theme');
    themeToggle.checked = false;
    if (themeToggleIcon) {
      themeToggleIcon.textContent = '🌙';
      themeToggleIcon.title = 'Switch to dark theme';
    }
  }
}

function toggleTheme() {
  const theme = themeToggle.checked ? 'dark' : 'light';
  applyTheme(theme);
  // Save theme preference
  window.electron
    .saveSettings({
      theme,
      listenPort: parseInt(listenPortValue.textContent),
      forwards: window.currentForwards || [],
    })
    .catch((err) => console.error('Error saving theme:', err));
}

async function checkRelayStatus() {
  const status = await window.electron.getRelayStatus();
  updateStatus(status);
}

function handleQsoTimeNow() {
  const now = new Date();
  // Use UTC date/time to match ADIF expectations
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toISOString().slice(11, 19); // HH:MM:SS
  if (qsoDateOn) qsoDateOn.value = date;
  if (qsoTimeOn) qsoTimeOn.value = time;
  updateLogContactButtonState();
}

async function handleQsoLogContact() {
  const dateon = qsoDateOn?.value || '';
  const timeon = qsoTimeOn?.value || '';
  const timestamp = `${dateon}T${timeon}Z`;

  const qso = {
    start: timestamp,
    end: timestamp,
    my_gridsquare: document.getElementById('deGrid')?.textContent || '',
  };

  Object.entries(qsoFields).forEach(([fieldName, config]) => {
    if (config.hidden) {
      return;
    }

    const extractor = qsoInputExtractors[fieldName];
    if (!extractor) {
      return;
    }

    const value = extractor();
    qso[fieldName] = value;
  });

  normalizeCalculatedFields(qso);

  const pota = {
    qso_date: dateon.replaceAll('-', ''),
    time_on: timeon.replaceAll(':', ''),
    my_state: (document.getElementById('qso-mystate')?.value || '').toUpperCase(),
    state: (document.getElementById('qso-state')?.value || '').toUpperCase(),
  };

  Object.entries(pota).forEach(([key, value]) => {
    if (value !== '') {
      qso[key] = value;
    }
  });

  const commentParts = [];
  if (pota.state) {
    commentParts.push(`State: ${pota.state}`);
  }
  if (qso.sig_info) {
    commentParts.push(`POTA: ${String(qso.sig_info).trim().toUpperCase()}`);
  }
  if (commentParts.length > 0) {
    const existingComment = String(qso.comment || '').trim();
    const detailComment = commentParts.join(' | ');
    qso.comment = existingComment ? `${existingComment} | ${detailComment}` : detailComment;
  }

  // Save QSO to persistent storage
  const saveResult = await window.electron.saveQso(qso);
  const persistedQso = saveResult && saveResult.qso ? saveResult.qso : qso;
  if (
    saveResult &&
    saveResult.success &&
    typeof window.electron.notifyQsoDataChanged === 'function'
  ) {
    window.electron.notifyQsoDataChanged();
  }
  normalizeCalculatedFields(persistedQso);
  addQsoEntry(persistedQso, 'normal');

  // Send to forwarders via relay
  try {
    await window.electron.resendQso(persistedQso);
  } catch (err) {
    console.error('Failed to send QSO to forwarders:', err);
  }

  // Reset certain fields
  qsoDateOn.value = '';
  qsoTimeOn.value = '';
  document.getElementById('qso-dxcall').value = '';
  document.getElementById('qso-rst').value = '';
  document.getElementById('qso-rcvd').value = '';
  document.getElementById('qso-state').value = '';
  document.getElementById('qso-siginfo').value = '';
  updateLogContactButtonState();
}

async function startRelay() {
  const result = await window.electron.startRelay();
  if (result.success) {
    updateStatus('running');
    addLogEntry(`Relay started`, 'success');
  }
}

async function stopRelay() {
  const result = await window.electron.stopRelay();
  if (result.success) {
    updateStatus('stopped');
    addLogEntry(`Relay stopped`, 'normal');
  }
}

function updateStatus(status) {
  relayRunning = status === 'running';

  if (relayRunning) {
    statusBadge.textContent = 'Running';
    statusBadge.className = 'status-badge running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusBadge.textContent = 'Stopped';
    statusBadge.className = 'status-badge stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function openSettings() {
  window.electron.openSettings();
}

function openQsoEditor() {
  window.electron.openQsoEditor();
}

function addLogEntry(msg, type = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const date = new Date();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const timestamp = `${hours}:${minutes}:${seconds}`;

  entry.textContent = `[${timestamp}] ${msg}`;

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep only last 1000 entries
  const entries = logContainer.querySelectorAll('.log-entry');
  if (entries.length > 1000) {
    entries[0].remove();
  }
}

function scrollQsoLogToBottom() {
  if (!qsoContainer) {
    return;
  }

  requestAnimationFrame(() => {
    qsoContainer.scrollTop = qsoContainer.scrollHeight;
  });
}

function addQsoEntry(qso, type = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type} qso-log-entry`;
  entry.dataset.call = String(qso.call || '').toUpperCase();

  const qsoMode = String(qso.mode || '').trim();
  const qsoSubmode = String(qso.submode || '').trim();
  const displayMode = qsoMode.toUpperCase() === 'MFSK' && qsoSubmode ? qsoSubmode : qsoMode;

  // Field Formatting should happen here.
  const isoStart = qso.start ? qso.start : qso.end ? qso.end : '0000-00-00T00:00:00Z';
  const display = {
    start: isoStart,
    call: qso.call || 'UNKNOWN',
    mode: displayMode,
    freq: typeof qso.freq === 'number' ? qso.freq.toFixed(4) : qso.freq || '',
    band: qso.band || '',
    tx_pwr: qso.tx_pwr || '',
  };

  // Make the start smaller for display (MM-DD @ HH:MM)
  let startParts = display.start.split('T');
  if (startParts.length >= 2) {
    const datePart = startParts[0];
    const timePart = startParts[1];
    display.start = `${datePart.substr(5, 5)} @ ${timePart.substr(0, 5)}`;
  }

  // Ensure columns are rendered in order
  const columns = [
    display.start,
    display.call,
    display.mode,
    display.freq,
    display.band,
    display.tx_pwr,
  ];

  columns.forEach((col) => {
    const span = document.createElement('span');
    span.textContent = col;
    entry.appendChild(span);
  });

  // Duplicate detection: match on call, band, and start date (YYYY-MM-DD)
  const modeMatchKey = (item) => {
    const mode = String(item.mode || '')
      .trim()
      .toUpperCase();
    const submode = String(item.submode || '')
      .trim()
      .toUpperCase();
    return mode === 'MFSK' && submode ? submode : mode;
  };

  const incomingCall = (qso.call || '').toUpperCase();
  const incomingBand = qso.band || '';
  const incomingDate = isoStart.split('T')[0] || '';
  const incomingMode = modeMatchKey(qso);

  const isDupe = qsoList.some((existing) => {
    const exCall = (existing.call || '').toUpperCase();
    const exBand = existing.band || '';
    const exIso = existing.start || existing.end || '';
    const exDate = exIso.split('T')[0] || '';
    const exMode = modeMatchKey(existing);
    return (
      exCall === incomingCall &&
      exBand === incomingBand &&
      exDate === incomingDate &&
      exMode === incomingMode
    );
  });

  let dupeMatch = null;
  const indicatorsWrap = document.createElement('span');
  indicatorsWrap.className = 'qso-indicators-wrap';
  let hasIndicators = false;

  if (isDupe) {
    // find the matching existing entry to show details in tooltip
    dupeMatch = qsoList.find((existing) => {
      const exCall = (existing.call || '').toUpperCase();
      const exBand = existing.band || '';
      const exIso = existing.start || existing.end || '';
      const exDate = exIso.split('T')[0] || '';
      const exMode = modeMatchKey(existing);
      return (
        exCall === incomingCall &&
        exBand === incomingBand &&
        exDate === incomingDate &&
        exMode === incomingMode
      );
    });

    const wrap = document.createElement('span');
    wrap.className = 'qso-dupe-wrap';

    const tag = document.createElement('span');
    tag.className = 'qso-dupe-tag';
    tag.textContent = 'DUPE';

    if (dupeMatch) {
      const exIso = dupeMatch.start || dupeMatch.end || '';
      const exDate = exIso.split('T')[0] || '';
      const exTime = (exIso.split('T')[1] || '').substr(0, 8) || '';
      const exMode =
        String(dupeMatch.mode || '').toUpperCase() === 'MFSK' &&
        String(dupeMatch.submode || '').trim()
          ? String(dupeMatch.submode || '').trim()
          : dupeMatch.mode || '';
      // Custom tooltip element with details including time
      const tooltip = document.createElement('span');
      tooltip.className = 'qso-dupe-tooltip';
      tooltip.textContent = `Duplicate of ${dupeMatch.call} ${dupeMatch.band} ${exDate} ${exTime} ${exMode}`;
      wrap.appendChild(tag);
      wrap.appendChild(tooltip);
    } else {
      wrap.appendChild(tag);
    }

    indicatorsWrap.appendChild(wrap);
    hasIndicators = true;
  }

  if (qso.sig_info) {
    // Display POTA pine tree icon if sig_info is defined
    const wrap = document.createElement('span');
    wrap.className = 'qso-pota-wrap';

    const pota = document.createElement('span');
    pota.className = 'qso-pota-icon';
    pota.textContent = '🌲';

    const tooltip = document.createElement('span');
    tooltip.className = 'qso-dupe-tooltip';
    tooltip.textContent = `POTA: ${qso.sig_info}`;

    wrap.appendChild(pota);
    wrap.appendChild(tooltip);
    indicatorsWrap.appendChild(wrap);
    hasIndicators = true;
  }

  const qrzSubmission =
    qso && qso.logSubmissions && qso.logSubmissions.qrz ? qso.logSubmissions.qrz : null;
  if (qrzSubmission && qrzSubmission.success === true) {
    const qrzBadge = document.createElement('span');
    qrzBadge.className = 'qso-app-badge qso-app-badge-qrz';
    qrzBadge.textContent = 'QRZ';
    const submittedAt = String(qrzSubmission.submittedAt || '').trim();
    if (submittedAt) {
      qrzBadge.title = `Submitted to QRZ: ${submittedAt}`;
    } else {
      qrzBadge.title = 'Submitted to QRZ';
    }
    indicatorsWrap.appendChild(qrzBadge);
    hasIndicators = true;
  }

  const clublogSubmission =
    qso && qso.logSubmissions && qso.logSubmissions.clublog ? qso.logSubmissions.clublog : null;
  if (clublogSubmission && clublogSubmission.success === true) {
    const clublogBadge = document.createElement('span');
    clublogBadge.className = 'qso-app-badge qso-app-badge-clublog';
    clublogBadge.textContent = 'CLUB';
    const submittedAt = String(clublogSubmission.submittedAt || '').trim();
    if (submittedAt) {
      clublogBadge.title = `Submitted to Clublog: ${submittedAt}`;
    } else {
      clublogBadge.title = 'Submitted to Clublog';
    }
    indicatorsWrap.appendChild(clublogBadge);
    hasIndicators = true;
  }

  if (hasIndicators) {
    entry.appendChild(indicatorsWrap);
  }

  qsoContainer.appendChild(entry);

  // Maintain in-memory list for future duplicate detection
  qsoList.push(qso);
  if (isBulkQsoRender) {
    return;
  }
  applyQsoCallFilter();
  // Apply row striping for readability
  applyQsoRowStripes();
  updateQsoCount();
  updateQsoTodayUtcCount();
  updateQsoLastHourCount();
  scrollQsoLogToBottom();
}

function applyQsoRowStripes() {
  const rows = Array.from(
    qsoContainer.querySelectorAll('.qso-log-entry:not(.qso-log-header):not([hidden])'),
  );
  rows.forEach((row, idx) => {
    row.classList.remove('qso-row-odd', 'qso-row-even');
    if (idx % 2 === 0) {
      row.classList.add('qso-row-even');
    } else {
      row.classList.add('qso-row-odd');
    }
  });
}

function applyQsoCallFilter() {
  const rows = Array.from(qsoContainer.querySelectorAll('.qso-log-entry:not(.qso-log-header)'));
  rows.forEach((row) => {
    const call = row.dataset.call || '';
    row.hidden = currentQsoCallFilter !== '' && !call.includes(currentQsoCallFilter);
  });

  applyQsoRowStripes();
  updateQsoCount();
}

async function refreshQsoLog() {
  // Clear the QSO log container (but keep the header)
  const header = qsoContainer.querySelector('.qso-log-header');
  qsoContainer.innerHTML = '';
  if (header) {
    qsoContainer.appendChild(header);
  }

  // Reset the in-memory list
  qsoList = [];

  // Reload QSOs from settings
  const settings = await window.electron.getSettings();
  const qsos = settings.qsos || [];
  isBulkQsoRender = true;
  qsos.forEach((qso) => {
    normalizeCalculatedFields(qso);
    addQsoEntry(qso, 'normal');
  });
  isBulkQsoRender = false;
  applyQsoCallFilter();
  updateQsoTodayUtcCount();
  updateQsoLastHourCount();
  updateQsoCount();
  scrollQsoLogToBottom();
}

function updateStatusIndicators(statusData) {
  deCall.textContent = statusData.deCall;
  deGrid.textContent = statusData.deGrid;
  updateLogContactButtonState();
  updateMyParkFromConfigurationName(statusData);

  if (statusData.frequency) {
    frequencyValue.textContent = `${statusData.frequency} MHz`;
    qsoFrequency.value = statusData.frequency;
    qsoBand.value = freqToBand(statusData.frequency);
  }

  if (statusData.mode) {
    modeValue.textContent = statusData.mode;
  }

  if (statusData.txEnabled !== undefined) {
    if (statusData.txEnabled) {
      txEnabledValue.textContent = 'Yes';
      txEnabledValue.classList.remove('indicator-off');
      txEnabledValue.classList.add('indicator-tx-enabled');
    } else {
      txEnabledValue.textContent = 'No';
      txEnabledValue.classList.remove('indicator-tx-enabled');
      txEnabledValue.classList.add('indicator-off');
    }
  }

  if (statusData.transmitting !== undefined) {
    if (statusData.transmitting) {
      transmittingValue.textContent = 'Yes';
      transmittingValue.classList.remove('indicator-off');
      transmittingValue.classList.add('indicator-transmitting');
    } else {
      transmittingValue.textContent = 'No';
      transmittingValue.classList.remove('indicator-transmitting');
      transmittingValue.classList.add('indicator-off');
    }
  }

  if (statusData.txMessage !== undefined) {
    transmitMessage.textContent = statusData.txMessage;
  }
}

function updateMyParkFromConfigurationName(statusData) {
  const configurationName = String(statusData.configurationName || '').trim();
  if (!configurationName || !configurationName.includes('@')) {
    return;
  }

  const [configCall, ...parkParts] = configurationName.split('@');
  if (!configCall || parkParts.length !== 1) {
    return;
  }

  const statusCall = String(statusData.deCall || '')
    .trim()
    .toUpperCase();
  if (!statusCall || configCall.trim().toUpperCase() !== statusCall) {
    return;
  }

  const mySigInfoInput = document.getElementById('qso-mysiginfo');
  if (!mySigInfoInput) {
    return;
  }

  const normalizedPark = preprocessManualFieldValue('my_sig_info', parkParts[0]);
  const validationError = validateManualFieldValue('my_sig_info', normalizedPark);
  if (validationError) {
    return;
  }

  mySigInfoInput.value = normalizedPark;
  mySigInfoInput.setCustomValidity('');
}

function clearLog() {
  logContainer.innerHTML = '';
}

function showSharedConfigWarning() {
  const banner = document.createElement('div');
  banner.className = 'shared-config-warning';
  banner.textContent = 'Warning: shared QSO field config failed to load (qso-fields.js).';
  document.body.insertBefore(banner, document.body.firstChild);
}

function clearQsoLog() {
  if (!confirm('Are you sure you want to clear all QSO logs? This cannot be undone.')) {
    return;
  }

  qsoContainer.innerHTML = '';
  // Clear the header
  const header = document.createElement('div');
  header.className = 'qso-log-entry qso-log-header';
  header.innerHTML = `
    <span>Timestamp</span>
    <span>DX Call</span>
    <span>Mode</span>
    <span>Freq</span>
    <span>Band</span>
    <span>Pwr</span>
  `;
  qsoContainer.appendChild(header);

  // Clear persistent storage
  window.electron.clearQsos();
  qsoList = [];
  updateQsoCount();
  updateQsoTodayUtcCount();
  updateQsoLastHourCount();
}

function updateQsoCount() {
  const entries = qsoContainer.querySelectorAll('.qso-log-entry:not(.qso-log-header)');
  qsoCount.textContent = `(${entries.length})`;
}

function updateQsoLastHourCount() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const lastHourCount = qsoList.filter((qso) => {
    const startTimeStr = qso.start || qso.end;
    if (!startTimeStr) return false;
    const qsoTime = new Date(startTimeStr);
    return qsoTime >= oneHourAgo && qsoTime <= now;
  }).length;

  if (qsoLastHour) {
    qsoLastHour.textContent = `Last Hour: ${lastHourCount}`;
  }
}

function updateQsoTodayUtcCount() {
  const now = new Date();
  const currentUtcDate = now.toISOString().slice(0, 10);

  const utcTodayCount = qsoList.filter((qso) => {
    const startTimeStr = qso.start || qso.end;
    if (!startTimeStr) return false;

    const qsoDate = new Date(startTimeStr);
    if (Number.isNaN(qsoDate.getTime())) return false;

    return qsoDate.toISOString().slice(0, 10) === currentUtcDate;
  }).length;

  if (qsoTodayUtc) {
    qsoTodayUtc.textContent = `Today: ${utcTodayCount}`;
  }
}
