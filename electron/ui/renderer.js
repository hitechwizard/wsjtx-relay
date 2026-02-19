const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const settingsBtn = document.getElementById('settingsBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const clearQsoBtn = document.getElementById('clearQsoBtn');
const qsoEditorBtn = document.getElementById('qsoEditorBtn');
const statusBadge = document.getElementById('statusBadge');
const logContainer = document.getElementById('logContainer');
const qsoContainer = document.getElementById('qsoContainer');
const qsoCount = document.getElementById('qsoCount');
const qsoLastHour = document.getElementById('qsoLastHour');
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
const qsoLogContactBtn = document.getElementById('qsoLogContact');
const qsoTimeNowBtn = document.getElementById('qsoTimeNow');
const qsoDateOn = document.getElementById('qso-dateon');
const qsoTimeOn = document.getElementById('qso-timeon');
const deCall = document.getElementById('deCall');
const deGrid = document.getElementById('deGrid');

let relayRunning = false;
let qsoList = [];

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
  qsoEditorBtn.addEventListener('click', openQsoEditor);
  if (qsoLogContactBtn) qsoLogContactBtn.addEventListener('click', handleQsoLogContact);
  if (qsoTimeNowBtn) qsoTimeNowBtn.addEventListener('click', handleQsoTimeNow);
  themeToggle.addEventListener('change', toggleTheme);

  // Uppercase conversion for call and state inputs
  const qsoDxCall = document.getElementById('qso-dxcall');
  const qsoState = document.getElementById('qso-state');
  if (qsoDxCall) {
    qsoDxCall.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  if (qsoState) {
    qsoState.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }

  // Theme change listener
  window.electron.onThemeChanged((theme) => {
    applyTheme(theme);
  });

  // QSO data refresh listener
  window.electron.onQsoDataRefresh(() => {
    refreshQsoLog();
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

  window.electron.onRelayQsoLogged(async (qso) => {
    addQsoEntry(qso, 'normal');
    // Save QSO from relay to persistent storage
    await window.electron.saveQso(qso);
  });

  // Update last hour count every minute
  setInterval(updateQsoLastHourCount, 60000);
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

  // Load and display persisted QSOs
  qsoList = [];
  const qsos = settings.qsos || [];
  qsos.forEach(qso => {
    addQsoEntry(qso, 'normal');
  });
  updateQsoCount();
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

function handleQsoTimeNow() {
  const now = new Date();
  // Use UTC date/time to match ADIF expectations
  const date = now.toISOString().slice(0,10); // YYYY-MM-DD
  const time = now.toISOString().slice(11,19); // HH:MM:SS
  if (qsoDateOn) qsoDateOn.value = date;
  if (qsoTimeOn) qsoTimeOn.value = time;
}

async function handleQsoLogContact() {

  /*
  const qso = {
    mysig: document.getElementById('qso-mysig')?.value || '',
    mysiginfo: document.getElementById('qso-mysiginfo')?.value || '',
    mystate: document.getElementById('qso-mystate')?.value || '',
    siginfo: document.getElementById('qso-siginfo')?.value || '',
  };
  */

  const dateon = qsoDateOn?.value || '';
  const timeon = qsoTimeOn?.value || '';
  const timestamp = `${dateon}T${timeon}Z`;

  // Matching WSJT-X's ADIF
  const qso = {
    call: document.getElementById('qso-dxcall')?.value || '',
    mode: document.getElementById('qso-mode')?.value || '',
    rst_sent: document.getElementById('qso-rst')?.value || '',
    rst_rcvd: document.getElementById('qso-rcvd')?.value || '',
    band: qsoBand?.value || '',
    freq: parseFloat(qsoFrequency?.value) || 0,
    station_callsign: document.getElementById('deCall').textContent,
    my_gridsquare: document.getElementById('deGrid').textContent,
    tx_pwr: document.getElementById('qso-txpwr')?.value || '',
    comment: '',
    start: timestamp,
    end: timestamp,
  }
  addQsoEntry(qso, 'normal');

  // Save QSO to persistent storage
  await window.electron.saveQso(qso);

  // Reset certain fields
  qsoDateOn.value = '';
  qsoTimeOn.value = '';
  document.getElementById('qso-dxcall').value = '';
  document.getElementById('qso-rst').value = '';
  document.getElementById('qso-rcvd').value = '';
  document.getElementById('qso-siginfo').value = '';


  // Try to send to main process if handler exists
  if (window.electron && window.electron.logQso) {
    window.electron.logQso(qso).catch(err => console.error('logQso failed', err));
  } else {
    console.log('Manual QSO logged (local):', qso);
  }
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

function addQsoEntry(qso, type = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type} qso-log-entry`;

  // Field Formatting should happen here.
  const isoStart = qso.start ? qso.start : qso.end ? qso.end : '0000-00-00T00:00:00Z';
  const display = {
    start: isoStart,
    call: qso.call || 'UNKNOWN',
    mode: qso.mode || '',
    freq: (typeof qso.freq === 'number') ? qso.freq.toFixed(4) : (qso.freq || ''),
    band: qso.band || '',
    tx_pwr: qso.tx_pwr || ''
  };

  // Make the start smaller for display (MM-DD @ HH:MM)
  let startParts = display.start.split('T');
  if (startParts.length >= 2) {
    const datePart = startParts[0];
    const timePart = startParts[1];
    display.start = `${datePart.substr(5,5)} @ ${timePart.substr(0,5)}`;
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
  const incomingCall = (qso.call || '').toUpperCase();
  const incomingBand = qso.band || '';
  const incomingDate = (isoStart.split('T')[0]) || '';
  const incomingMode = (qso.mode || '').toUpperCase();

  const isDupe = qsoList.some(existing => {
    const exCall = (existing.call || '').toUpperCase();
    const exBand = existing.band || '';
    const exIso = existing.start || existing.end || '';
    const exDate = exIso.split('T')[0] || '';
    const exMode = (existing.mode || '').toUpperCase();
    return exCall === incomingCall && exBand === incomingBand && exDate === incomingDate && exMode === incomingMode;
  });

  let dupeMatch = null;
  if (isDupe) {
    // find the matching existing entry to show details in tooltip
    dupeMatch = qsoList.find(existing => {
      const exCall = (existing.call || '').toUpperCase();
      const exBand = existing.band || '';
      const exIso = existing.start || existing.end || '';
      const exDate = exIso.split('T')[0] || '';
      const exMode = (existing.mode || '').toUpperCase();
      return exCall === incomingCall && exBand === incomingBand && exDate === incomingDate && exMode === incomingMode;
    });

    const wrap = document.createElement('span');
    wrap.className = 'qso-dupe-wrap';

    const tag = document.createElement('span');
    tag.className = 'qso-dupe-tag';
    tag.textContent = 'DUPE';

    if (dupeMatch) {
      const exIso = dupeMatch.start || dupeMatch.end || '';
      const exDate = exIso.split('T')[0] || '';
      const exTime = (exIso.split('T')[1] || '').substr(0,8) || '';
      const exMode = dupeMatch.mode || '';
      // Custom tooltip element with details including time
      const tooltip = document.createElement('span');
      tooltip.className = 'qso-dupe-tooltip';
      tooltip.textContent = `Duplicate of ${dupeMatch.call} ${dupeMatch.band} ${exDate} ${exTime} ${exMode}`;
      wrap.appendChild(tag);
      wrap.appendChild(tooltip);
    } else {
      wrap.appendChild(tag);
    }

    entry.appendChild(wrap);
  }

  qsoContainer.appendChild(entry);
  qsoContainer.scrollTop = qsoContainer.scrollHeight;

  // Maintain in-memory list for future duplicate detection
  qsoList.push(qso);
  // Apply row striping for readability
  applyQsoRowStripes();
  updateQsoCount();
  updateQsoLastHourCount();
}

function applyQsoRowStripes() {
  const rows = Array.from(qsoContainer.querySelectorAll('.qso-log-entry:not(.qso-log-header)'));
  rows.forEach((row, idx) => {
    row.classList.remove('qso-row-odd', 'qso-row-even');
    if ((idx % 2) === 0) {
      row.classList.add('qso-row-even');
    } else {
      row.classList.add('qso-row-odd');
    }
  });
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
  qsos.forEach(qso => {
    addQsoEntry(qso, 'normal');
  });
  updateQsoCount();
  updateQsoLastHourCount();
}

function updateStatusIndicators(statusData) {
  
  deCall.textContent = statusData.deCall;
  deGrid.textContent = statusData.deGrid;

  if (statusData.frequency) {
    frequencyValue.textContent = `${statusData.frequency} MHz`;
    qsoFrequency.value = statusData.frequency;
    let band;
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
        default:
            band = "OOB";
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
function clearLog() {
  logContainer.innerHTML = '';
}
function clearQsoLog() {
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
}

function updateQsoCount() {
  const entries = qsoContainer.querySelectorAll('.qso-log-entry:not(.qso-log-header)');
  qsoCount.textContent = `(${entries.length})`;
}

function updateQsoLastHourCount() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  const lastHourCount = qsoList.filter(qso => {
    const startTimeStr = qso.start || qso.end;
    if (!startTimeStr) return false;
    const qsoTime = new Date(startTimeStr);
    return qsoTime >= oneHourAgo && qsoTime <= now;
  }).length;
  
  if (qsoLastHour) {
    qsoLastHour.textContent = `Last Hour: ${lastHourCount}`;
  }
}
