const qsoListContainer = document.getElementById('qsoListContainer');
const saveQsoChanges = document.getElementById('saveQsoChanges');
const cancelQsoChanges = document.getElementById('cancelQsoChanges');
const importQsosBtn = document.getElementById('importQsosBtn');
const exportQsosBtn = document.getElementById('exportQsosBtn');
const resendAllQsosBtn = document.getElementById('resendAllQsosBtn');

const wsjtxFields = [
    {
        'band': { label: 'Band', type: 'enum', values: [ '160M', '80M', '40M', '30M', '20M', '17M', '15M', '12M', '10M', '6M', '2M', '70CM', '23CM', ] },
        'call': { label: 'DX Call', type: 'string' },
        'comment': { label: 'Comment', type: 'string' },
        'freq': { label: 'Frequency (Mhz)', type: 'number' },
        'gridsquare': { label: 'Gridsquare', type: 'string', regexp: '^[A-Z]{2}[0-9]{2}(?:[A-Z]{2})?$'},
        'mode': { label: 'Mode', type: 'enum', values: [ 'CW', 'SSB', 'FT8', 'FT4' ]},
        'operator': { label: 'Operator', type: 'string' },
        'rst_sent': { label: 'RST Sent', type: 'string' },
        'rst_recvd': { label: 'RST Rcvd', type: 'string' },
        'station_callsign': { label: 'DE Call', type: 'string' },
        'tx_pwr': { label: 'TX Pwr', type: 'number' },
        'start': { label: 'Start', type: 'string' },
        'end': { label: 'End', type: 'string' },
    }
]

let qsos = [];
let changedQsos = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadQsos();
  setupEventListeners();
});

function setupEventListeners() {
  saveQsoChanges.addEventListener('click', handleSaveChanges);
  cancelQsoChanges.addEventListener('click', closeWindow);
  importQsosBtn.addEventListener('click', handleImportQsos);
  exportQsosBtn.addEventListener('click', handleExportQsos);
  resendAllQsosBtn.addEventListener('click', handleResendAllQsos);

  // Theme change listener
  window.electron.onThemeChanged((theme) => {
    applyTheme(theme);
  });
}

async function loadTheme() {
  const theme = await window.electron.getTheme();
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

async function loadQsos() {
  try {
    qsos = await window.electron.getQsos();
    renderQsoList();
    // Scroll to bottom of QSO list after rendering
    setTimeout(() => {
      const contentDiv = document.querySelector('.qso-editor-content');
      if (contentDiv) {
        contentDiv.scrollTop = contentDiv.scrollHeight;
      }
    }, 0);
  } catch (error) {
    console.error('Failed to load QSOs:', error);
    addErrorMessage('Failed to load QSO data');
  }
}

function renderQsoList() {
  qsoListContainer.innerHTML = '';

  if (qsos.length === 0) {
    qsoListContainer.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary); text-align: center; padding: 20px;">No QSO records found</p>';
    return;
  }

  qsos.forEach((qso, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'qso-editor-card';
    itemDiv.dataset.index = index;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'qso-editor-card-header';
    headerDiv.innerHTML = `
      <div>
        <strong>${qso.call || '—'}</strong> on <strong>${qso.band || '—'}</strong>
        <div style="font-size: 12px; color: var(--text-secondary);">${formatDateTime(qso.start || qso.end)}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary btn-sm btn-resend" data-index="${index}">Resend</button>
        <button class="btn btn-danger btn-sm btn-delete" data-index="${index}">Delete</button>
      </div>
    `;

    const formDiv = document.createElement('div');
    formDiv.className = 'qso-editor-fields';
    formDiv.innerHTML = `
      <div class="editor-field">
        <label>Call</label>
        <input type="text" class="qso-field" data-field="call" data-index="${index}" value="${qso.call || ''}" />
      </div>
      <div class="editor-field">
        <label>Band</label>
        <input type="text" class="qso-field" data-field="band" data-index="${index}" value="${qso.band || ''}" />
      </div>
      <div class="editor-field">
        <label>Mode</label>
        <input type="text" class="qso-field" data-field="mode" data-index="${index}" value="${qso.mode || ''}" />
      </div>
      <div class="editor-field">
        <label>Frequency (Hz)</label>
        <input type="number" class="qso-field" data-field="freq" data-index="${index}" value="${qso.freq || ''}" />
      </div>
      <div class="editor-field">
        <label>Start Time</label>
        <input type="text" class="qso-field" data-field="start" data-index="${index}" value="${qso.start || ''}" />
      </div>
      <div class="editor-field">
        <label>End Time</label>
        <input type="text" class="qso-field" data-field="end" data-index="${index}" value="${qso.end || ''}" />
      </div>
      <div class="editor-field">
        <label>RST Rcvd</label>
        <input type="text" class="qso-field" data-field="rst_rcvd" data-index="${index}" value="${qso.rst_rcvd || ''}" />
      </div>
      <div class="editor-field">
        <label>RST Sent</label>
        <input type="text" class="qso-field" data-field="rst_sent data-index="${index}" value="${qso.rst_sent || ''}" />
      </div>
      <div class="editor-field">
        <label>TX Power (W)</label>
        <input type="number" class="qso-field" data-field="tx_pwr" data-index="${index}" value="${qso.tx_pwr || ''}" />
      </div>
      <div class="editor-field">
        <label>My Sig</label>
        <input type="text" class="qso-field" data-field="my_sig" data-index="${index}" value="${qso.my_sig || ''}" />
      </div>
      <div class="editor-field">
        <label>My Sig Info</label>
        <input type="text" class="qso-field" data-field="my_sig_info" data-index="${index}" value="${qso.my_sig_info || ''}" />
      </div>
      <div class="editor-field">
        <label>Sig Info</label>
        <input type="text" class="qso-field" data-field="sig_info" data-index="${index}" value="${qso.sig_info || ''}" />
      </div>
      <div class="editor-field">
        <label>Comment</label>
        <input type="text" class="qso-field" data-field="comment" data-index="${index}" value="${qso.comment || ''}" />
      </div>
    `;

    itemDiv.appendChild(headerDiv);
    itemDiv.appendChild(formDiv);
    qsoListContainer.appendChild(itemDiv);
  });

  // Add event listeners
  qsoListContainer.querySelectorAll('.qso-field').forEach((input) => {
    input.addEventListener('change', handleFieldChange);
  });

  qsoListContainer.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', handleDeleteQso);
  });

  qsoListContainer.querySelectorAll('.btn-resend').forEach((btn) => {
    btn.addEventListener('click', handleResendQso);
  });
}

function handleFieldChange(e) {
  const index = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  qsos[index][field] = e.target.value;
  changedQsos.add(index);
  
  // Highlight changed record
  const card = e.target.closest('.qso-editor-card');
  if (card) {
    card.classList.add('changed');
  }
}

function handleDeleteQso(e) {
  const index = parseInt(e.target.dataset.index);
  const qso = qsos[index];
  
  if (confirm(`Delete QSO with ${qso.call || '—'} on ${qso.band || '—'}?`)) {
    qsos.splice(index, 1);
    changedQsos.delete(index);
    renderQsoList();
    
    // After deletion, we need to update indices in changedQsos
    const updatedChangedQsos = new Set();
    changedQsos.forEach((idx) => {
      if (idx > index) {
        updatedChangedQsos.add(idx - 1);
      } else if (idx < index) {
        updatedChangedQsos.add(idx);
      }
    });
    changedQsos = updatedChangedQsos;
  }
}

async function handleResendQso(e) {
  const index = parseInt(e.target.dataset.index);
  const qso = qsos[index];
  
  try {
    const result = await window.electron.resendQso(qso);
    if (result.success) {
      alert(`✓ QSO ${qso.call || '—'} resent to forwarders successfully`);
      addSuccessMessage(`QSO ${qso.call || '—'} resent to forwarders`);
    } else {
      alert(`✗ Failed to resend QSO: ${result.error || 'Unknown error'}`);
      addErrorMessage(result.error || 'Failed to resend QSO');
    }
  } catch (err) {
    alert(`✗ Resend error: ${err.message}`);
    addErrorMessage(`Resend error: ${err.message}`);
  }
}

async function handleSaveChanges() {
  try {
    await window.electron.updateQsos(qsos);
    // Notify the main window to refresh the QSO log
    window.electron.notifyQsoDataChanged();
    changedQsos.clear();
    // Remove highlight from changed records
    qsoListContainer.querySelectorAll('.qso-editor-card').forEach((card) => {
      card.classList.remove('changed');
    });
    addSuccessMessage('All changes saved successfully');
    setTimeout(() => {
      closeWindow();
    }, 1000);
  } catch (error) {
    console.error('Failed to save changes:', error);
    addErrorMessage('Failed to save changes');
  }
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  } catch {
    return '—';
  }
}

function addSuccessMessage(msg) {
  // Simple success notification
  console.log('Success:', msg);
}

function addErrorMessage(msg) {
  // Simple error notification
  console.error('Error:', msg);
}

async function handleExportQsos() {
  try {
    const result = await window.electron.exportQsosAdif();
    if (result.success) {
      addSuccessMessage(`QSOs exported to ${result.filePath}`);
    } else {
      addErrorMessage(result.error || 'Export failed');
    }
  } catch (err) {
    addErrorMessage(`Export error: ${err.message}`);
  }
}

async function handleImportQsos() {
  try {
    const result = await window.electron.importQsosAdif();
    if (result.success) {
      const importedCount = result.qsos?.length || 0;
      const shouldMerge = confirm(`Import ${importedCount} QSOs from file? They will be added to your current list.`);
      
      if (shouldMerge) {
        // Merge imported QSOs with existing ones
        const mergedQsos = [...qsos, ...result.qsos];
        await window.electron.updateQsos(mergedQsos);
        await loadQsos();
        addSuccessMessage(`${importedCount} QSOs imported successfully`);
      }
    } else {
      addErrorMessage(result.error || 'Import failed');
    }
  } catch (err) {
    addErrorMessage(`Import error: ${err.message}`);
  }
}

async function handleResendAllQsos() {
  try {
    const result = await window.electron.resendAllQsos();
    if (result.success) {
      alert(`✓ ${result.count} QSOs resent to forwarders successfully`);
      addSuccessMessage(`${result.count} QSOs resent to forwarders`);
    } else {
      alert(`✗ Failed to resend QSOs: ${result.error || 'Unknown error'}`);
      addErrorMessage(result.error || 'Failed to resend QSOs');
    }
  } catch (err) {
    alert(`✗ Resend error: ${err.message}`);
    addErrorMessage(`Resend error: ${err.message}`);
  }
}

function closeWindow() {
  // Notify the main window to refresh the QSO log
  window.electron.notifyQsoDataChanged();
  window.electron.closeQsoEditor();
}
