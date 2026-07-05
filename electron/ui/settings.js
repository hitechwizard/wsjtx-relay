const settingsForm = document.getElementById('settingsForm');
const listenPortInput = document.getElementById('listenPort');
const forwardDelaySecondsInput = document.getElementById('forwardDelaySeconds');
const forwardsList = document.getElementById('forwardsList');
const newForwardInput = document.getElementById('newForward');
const addForwardBtn = document.getElementById('addForwardBtn');
const cancelBtn = document.getElementById('cancelBtn');
const themeLightInput = document.getElementById('themeLight');
const themeDarkInput = document.getElementById('themeDark');
const autoStartRelayInput = document.getElementById('autoStartRelay');
const flrigEnabledInput = document.getElementById('flrigEnabled');
const flrigEndpointInput = document.getElementById('flrigEndpoint');
const defaultMyCallInput = document.getElementById('defaultMyCall');
const defaultMyGridInput = document.getElementById('defaultMyGrid');
const usePotaSpotMapInput = document.getElementById('usePotaSpotMap');
const manualQsoEntryTypeInput = document.getElementById('manualQsoEntryType');
const qrzLoggingEnabledInput = document.getElementById('qrzLoggingEnabled');
const qrzApiKeyInput = document.getElementById('qrzApiKey');
const toggleQrzApiKeyBtn = document.getElementById('toggleQrzApiKeyBtn');
const clublogLoggingEnabledInput = document.getElementById('clublogLoggingEnabled');
const clublogCallsignInput = document.getElementById('clublogCallsign');
const clublogPasswordInput = document.getElementById('clublogPassword');
const toggleClublogPasswordBtn = document.getElementById('toggleClublogPasswordBtn');
const clublogEmailInput = document.getElementById('clublogEmail');
const decodeSightingExpirationMinutesInput = document.getElementById(
  'decodeSightingExpirationMinutes',
);
const dxSummitWorkedMatchFieldInputs = Array.from(
  document.querySelectorAll('input[name="dxSummitWorkedMatchFields"]'),
);

let forwardsData = [];
let currentTheme = 'light';

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  addForwardBtn.addEventListener('click', addForward);
  newForwardInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addForward();
    }
  });
  settingsForm.addEventListener('submit', saveSettings);
  cancelBtn.addEventListener('click', closeWindow);
  toggleQrzApiKeyBtn.addEventListener('click', () => {
    togglePasswordVisibility(qrzApiKeyInput, toggleQrzApiKeyBtn);
  });
  toggleClublogPasswordBtn.addEventListener('click', () => {
    togglePasswordVisibility(clublogPasswordInput, toggleClublogPasswordBtn);
  });
  flrigEnabledInput.addEventListener('change', updateFlrigEndpointState);
  defaultMyCallInput.addEventListener('input', (e) => {
    e.target.value = String(e.target.value || '')
      .toUpperCase()
      .trim();
  });
  defaultMyGridInput.addEventListener('input', (e) => {
    e.target.value = String(e.target.value || '')
      .toUpperCase()
      .trim();
  });
  // Auto-uppercase Clublog callsign as user types
  clublogCallsignInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
}

async function loadSettings() {
  const settings = await window.electron.getSettings();
  listenPortInput.value = settings.listenPort;
  autoStartRelayInput.checked = Boolean(settings.autoStartRelay);
  flrigEnabledInput.checked = Boolean(settings.flrigEnabled);
  flrigEndpointInput.value = String(settings.flrigEndpoint || '127.0.0.1:12345');
  defaultMyCallInput.value = String(settings.defaultMyCall || '');
  defaultMyGridInput.value = String(settings.defaultMyGrid || '');
  usePotaSpotMapInput.checked = Boolean(settings.usePotaSpotMap);
  manualQsoEntryTypeInput.value =
    settings.manualQsoEntryType === 'arrl-field-day' ? 'arrl-field-day' : 'pota';
  qrzLoggingEnabledInput.checked = Boolean(settings.qrzLoggingEnabled);
  qrzApiKeyInput.value = String(settings.qrzApiKey || '');
  clublogLoggingEnabledInput.checked = Boolean(settings.clublogLoggingEnabled);
  clublogCallsignInput.value = String(settings.clublogCallsign || '');
  clublogPasswordInput.value = String(settings.clublogPassword || '');
  clublogEmailInput.value = String(settings.clublogEmail || '');
  forwardDelaySecondsInput.value = settings.forwardDelaySeconds ?? 0.5;
  decodeSightingExpirationMinutesInput.value = settings.decodeSightingExpirationMinutes ?? 5;
  const workedMatchFields = Array.isArray(settings.dxSummitWorkedMatchFields)
    ? settings.dxSummitWorkedMatchFields
    : ['call', 'band', 'mode', 'date'];
  const workedMatchFieldSet = new Set(
    workedMatchFields.map((value) =>
      String(value || '')
        .trim()
        .toLowerCase(),
    ),
  );
  dxSummitWorkedMatchFieldInputs.forEach((input) => {
    input.checked = workedMatchFieldSet.has(
      String(input.value || '')
        .trim()
        .toLowerCase(),
    );
  });
  currentTheme = settings.theme || 'light';
  forwardsData = (settings.forwards || []).map((forward) => ({
    host: forward.host,
    port: forward.port,
    disabled: Boolean(forward.disabled),
  }));

  // Set theme selection
  if (currentTheme === 'dark') {
    themeDarkInput.checked = true;
  } else {
    themeLightInput.checked = true;
  }

  renderForwardsList();
  updateFlrigEndpointState();
}

function updateFlrigEndpointState() {
  if (!flrigEndpointInput) {
    return;
  }
  flrigEndpointInput.disabled = !flrigEnabledInput.checked;
}

function togglePasswordVisibility(input, button) {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  button.textContent = isPassword ? 'Hide' : 'Reveal';
}

function renderForwardsList() {
  forwardsList.innerHTML = '';

  forwardsData.forEach((forward, index) => {
    const item = document.createElement('div');
    item.className = 'forward-item';
    if (forward.disabled) {
      item.classList.add('forward-item-disabled');
    }

    const addr = document.createElement('span');
    addr.className = 'forward-item-addr';
    addr.textContent = `${forward.host}:${forward.port}`;

    const controls = document.createElement('div');
    controls.className = 'forward-item-controls';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'forward-enabled-label';

    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.checked = !forward.disabled;
    enabledCheckbox.addEventListener('change', (e) => {
      toggleForwardDisabled(index, !e.target.checked);
    });

    const enabledText = document.createElement('span');
    enabledText.textContent = 'Enabled';

    enabledLabel.appendChild(enabledCheckbox);
    enabledLabel.appendChild(enabledText);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeForward(index));

    controls.appendChild(enabledLabel);
    controls.appendChild(removeBtn);

    item.appendChild(addr);
    item.appendChild(controls);
    forwardsList.appendChild(item);
  });
}

async function loadTheme() {
  const theme = await window.electron.getTheme();
  applyTheme(theme);
}

function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

async function addForward() {
  const value = newForwardInput.value.trim();

  if (!value) {
    alert('Please enter a forward address');
    return;
  }

  // Validate format: host:port
  const separatorIndex = value.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    alert('Invalid format. Use: host:port (e.g., 127.0.0.1:2238)');
    return;
  }

  const host = value.slice(0, separatorIndex).trim();
  const portStr = value.slice(separatorIndex + 1).trim();

  // Validate host syntax before DNS preflight
  if (!isValidForwardHost(host)) {
    alert('Invalid host. Use an IPv4 address or valid hostname (FQDN).');
    return;
  }

  // Validate port
  const port = parseInt(portStr);
  if (isNaN(port) || port < 1 || port > 65535) {
    alert('Invalid port number (1-65535)');
    return;
  }

  // Check for duplicates
  const duplicate = forwardsData.find((f) => f.host === host && f.port === port);
  if (duplicate) {
    alert('This forward address is already in the list');
    return;
  }

  // Ensure host resolves to IPv4 so udp4 send/receive behavior is predictable.
  try {
    const validation = await window.electron.validateForwardHost(host);
    if (!validation || !validation.valid) {
      alert(`Host lookup failed: ${validation?.error || 'No IPv4 address found'}`);
      return;
    }
  } catch (error) {
    alert(`Unable to validate host: ${error.message}`);
    return;
  }

  forwardsData.push({ host, port, disabled: false });
  newForwardInput.value = '';
  renderForwardsList();
}

function toggleForwardDisabled(index, disabled) {
  if (!forwardsData[index]) {
    return;
  }

  forwardsData[index].disabled = disabled;
  renderForwardsList();
}

function removeForward(index) {
  forwardsData.splice(index, 1);
  renderForwardsList();
}

async function saveSettings(e) {
  e.preventDefault();

  const listenPort = parseInt(listenPortInput.value);
  const autoStartRelay = Boolean(autoStartRelayInput.checked);
  const flrigEnabled = Boolean(flrigEnabledInput.checked);
  const flrigEndpoint = String(flrigEndpointInput.value || '').trim();
  const defaultMyCall = String(defaultMyCallInput.value || '')
    .trim()
    .toUpperCase();
  const defaultMyGrid = String(defaultMyGridInput.value || '')
    .trim()
    .toUpperCase();
  const usePotaSpotMap = Boolean(usePotaSpotMapInput.checked);
  const manualQsoEntryType =
    manualQsoEntryTypeInput.value === 'arrl-field-day' ? 'arrl-field-day' : 'pota';
  const qrzLoggingEnabled = Boolean(qrzLoggingEnabledInput.checked);
  const qrzApiKey = String(qrzApiKeyInput.value || '').trim();
  const clublogLoggingEnabled = Boolean(clublogLoggingEnabledInput.checked);
  const clublogCallsign = String(clublogCallsignInput.value || '').trim();
  const clublogPassword = String(clublogPasswordInput.value || '').trim();
  const clublogEmail = String(clublogEmailInput.value || '').trim();
  const forwardDelaySeconds = parseFloat(forwardDelaySecondsInput.value);
  const decodeSightingExpirationMinutes = parseInt(decodeSightingExpirationMinutesInput.value, 10);
  const dxSummitWorkedMatchFields = dxSummitWorkedMatchFieldInputs
    .filter((input) => input.checked)
    .map((input) =>
      String(input.value || '')
        .trim()
        .toLowerCase(),
    );
  const theme = themeDarkInput.checked ? 'dark' : 'light';

  if (isNaN(listenPort) || listenPort < 1 || listenPort > 65535) {
    alert('Invalid listen port (1-65535)');
    return;
  }

  if (isNaN(forwardDelaySeconds) || forwardDelaySeconds < 0) {
    alert('Invalid forward delay (must be 0 or greater)');
    return;
  }

  if (flrigEnabled) {
    const parsedFlrigEndpoint = parseHostPort(flrigEndpoint);
    if (!parsedFlrigEndpoint || !isValidForwardHost(parsedFlrigEndpoint.host)) {
      alert('Invalid flrig endpoint. Use host:port (for example, 127.0.0.1:12345)');
      return;
    }
  }

  if (isNaN(decodeSightingExpirationMinutes) || decodeSightingExpirationMinutes < 0) {
    alert('Invalid decode sighting expiration (must be 0 or greater)');
    return;
  }

  if (defaultMyCall && !/^[A-Z0-9/]{3,20}$/.test(defaultMyCall)) {
    alert('Invalid Default My Call');
    return;
  }

  if (defaultMyGrid && !/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(defaultMyGrid)) {
    alert('Invalid Default My Grid');
    return;
  }

  if (dxSummitWorkedMatchFields.length === 0) {
    alert('Select at least one DX Summit worked match field');
    return;
  }

  if (forwardsData.length === 0) {
    alert('At least one forward endpoint must be configured');
    return;
  }

  // Validate Clublog email if provided
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (clublogEmail && !emailRegex.test(clublogEmail)) {
    alert('Invalid email address for Clublog (or leave empty)');
    return;
  }

  try {
    const result = await window.electron.saveSettings({
      listenPort,
      forwards: forwardsData,
      autoStartRelay,
      flrigEnabled,
      flrigEndpoint,
      defaultMyCall,
      defaultMyGrid,
      usePotaSpotMap,
      manualQsoEntryType,
      qrzLoggingEnabled,
      qrzApiKey,
      clublogLoggingEnabled,
      clublogCallsign: clublogCallsign.toUpperCase(),
      clublogPassword,
      clublogEmail,
      forwardDelaySeconds,
      decodeSightingExpirationMinutes,
      dxSummitWorkedMatchFields,
      theme,
    });

    if (!result || result.success === false) {
      throw new Error(result?.error || 'Settings save failed');
    }

    closeWindow();
  } catch (error) {
    alert(`Error saving settings: ${error.message}`);
  }
}

function closeWindow() {
  // Close the settings window
  window.electron.closeSettings();
}

function isValidIPv4(ip) {
  const ipRegex =
    /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
  return ipRegex.test(ip);
}

function parseHostPort(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const separatorIndex = raw.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
    return null;
  }

  const host = raw.slice(0, separatorIndex).trim();
  const port = Number.parseInt(raw.slice(separatorIndex + 1).trim(), 10);

  if (!host || Number.isNaN(port) || port < 1 || port > 65535) {
    return null;
  }

  return { host, port };
}

function isValidForwardHost(host) {
  if (isValidIPv4(host)) {
    return true;
  }

  // RFC-aligned hostname validation, permitting single-label hostnames and FQDNs.
  const normalized = host.endsWith('.') ? host.slice(0, -1) : host;
  if (!normalized || normalized.length > 253) {
    return false;
  }

  const labels = normalized.split('.');
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[A-Za-z0-9-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}
