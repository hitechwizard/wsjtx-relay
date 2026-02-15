const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const settingsBtn = document.getElementById('settingsBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const clearQsoBtn = document.getElementById('clearQsoBtn');
const statusBadge = document.getElementById('statusBadge');
const logContainer = document.getElementById('logContainer');
const qsoContainer = document.getElementById('qsoContainer');
const listenPortValue = document.getElementById('listenPortValue');
const forwardsValue = document.getElementById('forwardsValue');
const themeToggle = document.getElementById('themeToggle');
const frequencyValue = document.getElementById('frequencyValue');
const modeValue = document.getElementById('modeValue');
const txEnabledValue = document.getElementById('txEnabledValue');
const transmittingValue = document.getElementById('transmittingValue');
const transmitMessage = document.getElementById('transmitMessage');

const qsoFrequency = document.getElementById('qso-frequency');
const qsoBand = document.getElementById('qso-band');

let relayRunning = false;

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
  clearLogBtn.addEventListener('click', clearLog);
  clearQsoBtn.addEventListener('click', clearQsoLog);
  themeToggle.addEventListener('change', toggleTheme);

  // Theme change listener
  window.electron.onThemeChanged((theme) => {
    applyTheme(theme);
  });

  // Relay events
  window.electron.onRelayLog((msg) => {
    addLogEntry(msg, 'normal');
  });

  window.electron.onRelayStatus((status) => {
    updateStatus(status);
  });

  window.electron.onRelayError((msg) => {
    addLogEntry(`ERROR: ${msg}`, 'error');
  });

  window.electron.onRelayDecode((msg) => {
    addLogEntry(msg, 'normal');
  });

  window.electron.onRelayStatusUpdate((statusData) => {
    updateStatusIndicators(statusData);
  });

  window.electron.onRelayQsoLogged((adif) => {
    addLogEntry(adif, 'normal', 'qso');
  });
}

async function loadSettings() {
  const settings = await window.electron.getSettings();
  listenPortValue.textContent = settings.listenPort;
  window.currentForwards = settings.forwards || [];
  
  if (settings.forwards.length > 0) {
    forwardsValue.textContent = settings.forwards.map(f => `${f.host}:${f.port}`).join(', ');
  } else {
    forwardsValue.textContent = 'None configured';
  }
}

async function loadTheme() {
  const theme = await window.electron.getTheme();
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.checked = true;
  } else {
    document.body.classList.remove('dark-theme');
    themeToggle.checked = false;
  }
}

function toggleTheme() {
  const theme = themeToggle.checked ? 'dark' : 'light';
  applyTheme(theme);
  // Save theme preference
  window.electron.saveSettings({
    theme,
    listenPort: parseInt(listenPortValue.textContent),
    forwards: window.currentForwards || []
  }).catch(err => console.error('Error saving theme:', err));
}

async function checkRelayStatus() {
  const status = await window.electron.getRelayStatus();
  updateStatus(status);
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

function addLogEntry(msg, type = 'normal', logType = 'log') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const date = new Date();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const timestamp = `${hours}:${minutes}:${seconds}`;

  entry.textContent = `[${timestamp}] ${msg}`;
  
  let container = logContainer;
  if (logType == 'qso') {
    container = qsoContainer;
  }
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

  // Keep only last 1000 entries
  const entries = container.querySelectorAll('.log-entry');
  if (entries.length > 1000) {
    entries[0].remove();
  }
}

function updateStatusIndicators(statusData) {
  if (statusData.frequency) {
    frequencyValue.textContent = `${statusData.frequency} MHz`;
    qsoFrequency.value = statusData.frequency;
    let band = '';
    switch (true) {
        case (statusData.frequency >= 50.0 && statusData.frequency <= 54.0):
            band = '6m';
            break;
        case (statusData.frequency >= 28.0 && statusData.frequency <= 29.7):
            band = '10m';
            break;
        case (statusData.frequency >= 24.890 && statusData.frequency <= 24.990):
            band = '12m';
            break;
        case (statusData.frequency >= 21.0 && statusData.frequency <= 21.450):
            band = '15m';
            break;
        case (statusData.frequency >= 18.068 && statusData.frequency <= 18.168):
            band = '17m';
            break;
        case (statusData.frequency >= 14.0 && statusData.frequency <= 14.350):
            band = '20m';
            break;
        case (statusData.frequency >= 10.1 && statusData.frequency <= 10.150):
            band = '30m';
            break;
        case (statusData.frequency >= 7.0 && statusData.frequency <= 7.3):
            band = '40m';
            break;
        case (statusData.frequency >= 5.3 && statusData.frequency <= 5.5):
            band = '60m';
            break;
        case (statusData.frequency >= 3.5 && statusData.frequency <= 4.0):
            band = '80m';
            break;
        case (statusData.frequency >= 1.8 && statusData.frequency <= 2.0):
            band = '160m';
            break;
    }
    qsoBand.value = band;
  }
  
  if (statusData.mode) {
    modeValue.textContent = statusData.mode;
  }
  
  if (statusData.txEnabled !== undefined) {
    if (statusData.txEnabled) {
      txEnabledValue.textContent = 'Yes';
      txEnabledValue.classList.remove('indicator-off');
      txEnabledValue.classList.add('indicator-on');
    } else {
      txEnabledValue.textContent = 'No';
      txEnabledValue.classList.remove('indicator-on');
      txEnabledValue.classList.add('indicator-off');
    }
  }
  
  if (statusData.transmitting !== undefined) {
    if (statusData.transmitting) {
      transmittingValue.textContent = 'Yes';
      transmittingValue.classList.remove('indicator-off');
      transmittingValue.classList.add('indicator-on');
    } else {
      transmittingValue.textContent = 'No';
      transmittingValue.classList.remove('indicator-on');
      transmittingValue.classList.add('indicator-off');
    }
  }

  if (statusData.txMessage !== undefined) {
    transmitMessage.textContent = statusData.txMessage;
  }
}
function clearLog() {
  logContainer.innerHTML = '';
}
function clearQsoLog() {
  qsoContainer.innerHTML = '';
}
