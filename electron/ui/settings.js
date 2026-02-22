const settingsForm = document.getElementById('settingsForm');
const listenPortInput = document.getElementById('listenPort');
const forwardDelaySecondsInput = document.getElementById('forwardDelaySeconds');
const forwardsList = document.getElementById('forwardsList');
const newForwardInput = document.getElementById('newForward');
const addForwardBtn = document.getElementById('addForwardBtn');
const cancelBtn = document.getElementById('cancelBtn');
const themeLightInput = document.getElementById('themeLight');
const themeDarkInput = document.getElementById('themeDark');

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
}

async function loadSettings() {
  const settings = await window.electron.getSettings();
  listenPortInput.value = settings.listenPort;
  forwardDelaySecondsInput.value = settings.forwardDelaySeconds ?? 0.5;
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

function addForward() {
  const value = newForwardInput.value.trim();

  if (!value) {
    alert('Please enter a forward address');
    return;
  }

  // Validate format: host:port
  const parts = value.split(':');
  if (parts.length !== 2) {
    alert('Invalid format. Use: host:port (e.g., 127.0.0.1:2238)');
    return;
  }

  const host = parts[0].trim();
  const portStr = parts[1].trim();

  // Validate IPv4 address
  if (!isValidIPv4(host)) {
    alert('Invalid IPv4 address');
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
  const forwardDelaySeconds = parseFloat(forwardDelaySecondsInput.value);
  const theme = themeDarkInput.checked ? 'dark' : 'light';

  if (isNaN(listenPort) || listenPort < 1 || listenPort > 65535) {
    alert('Invalid listen port (1-65535)');
    return;
  }

  if (isNaN(forwardDelaySeconds) || forwardDelaySeconds < 0) {
    alert('Invalid forward delay (must be 0 or greater)');
    return;
  }

  if (forwardsData.length === 0) {
    alert('At least one forward endpoint must be configured');
    return;
  }

  try {
    await window.electron.saveSettings({
      listenPort,
      forwards: forwardsData,
      forwardDelaySeconds,
      theme,
    });
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
