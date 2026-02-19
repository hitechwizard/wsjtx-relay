const qsoListContainer = document.getElementById('qsoListContainer');
const saveQsoChanges = document.getElementById('saveQsoChanges');
const cancelQsoChanges = document.getElementById('cancelQsoChanges');

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
    itemDiv.className = 'qso-edit-card';
    itemDiv.dataset.index = index;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'qso-card-header';
    headerDiv.innerHTML = `
      <div>
        <strong>${qso.call || '—'}</strong> on <strong>${qso.band || '—'}</strong>
        <div style="font-size: 12px; color: var(--text-secondary);">${formatDateTime(qso.start || qso.end)}</div>
      </div>
      <button class="btn btn-danger btn-sm btn-delete" data-index="${index}">Delete</button>
    `;

    const formDiv = document.createElement('div');
    formDiv.className = 'qso-edit-fields';
    formDiv.innerHTML = `
      <div class="edit-field">
        <label>Call</label>
        <input type="text" class="qso-field" data-field="call" data-index="${index}" value="${qso.call || ''}" />
      </div>
      <div class="edit-field">
        <label>Band</label>
        <input type="text" class="qso-field" data-field="band" data-index="${index}" value="${qso.band || ''}" />
      </div>
      <div class="edit-field">
        <label>Mode</label>
        <input type="text" class="qso-field" data-field="mode" data-index="${index}" value="${qso.mode || ''}" />
      </div>
      <div class="edit-field">
        <label>Frequency (Hz)</label>
        <input type="number" class="qso-field" data-field="freq" data-index="${index}" value="${qso.freq || ''}" />
      </div>
      <div class="edit-field">
        <label>Start Time</label>
        <input type="text" class="qso-field" data-field="start" data-index="${index}" value="${qso.start || ''}" />
      </div>
      <div class="edit-field">
        <label>End Time</label>
        <input type="text" class="qso-field" data-field="end" data-index="${index}" value="${qso.end || ''}" />
      </div>
      <div class="edit-field">
        <label>RX RST</label>
        <input type="number" class="qso-field" data-field="rxrst" data-index="${index}" value="${qso.rxrst || ''}" />
      </div>
      <div class="edit-field">
        <label>TX RST</label>
        <input type="number" class="qso-field" data-field="txrst" data-index="${index}" value="${qso.txrst || ''}" />
      </div>
      <div class="edit-field">
        <label>TX Power (W)</label>
        <input type="number" class="qso-field" data-field="txpwr" data-index="${index}" value="${qso.txpwr || ''}" />
      </div>
      <div class="edit-field">
        <label>My Sig</label>
        <input type="text" class="qso-field" data-field="mysig" data-index="${index}" value="${qso.mysig || ''}" />
      </div>
      <div class="edit-field">
        <label>My Sig Info</label>
        <input type="text" class="qso-field" data-field="mysiginfo" data-index="${index}" value="${qso.mysiginfo || ''}" />
      </div>
      <div class="edit-field">
        <label>Sig Info</label>
        <input type="text" class="qso-field" data-field="siginfo" data-index="${index}" value="${qso.siginfo || ''}" />
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
}

function handleFieldChange(e) {
  const index = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  qsos[index][field] = e.target.value;
  changedQsos.add(index);
  
  // Highlight changed record
  const card = e.target.closest('.qso-edit-card');
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

async function handleSaveChanges() {
  try {
    await window.electron.updateQsos(qsos);
    // Notify the main window to refresh the QSO log
    window.electron.notifyQsoDataChanged();
    changedQsos.clear();
    // Remove highlight from changed records
    qsoListContainer.querySelectorAll('.qso-edit-card').forEach((card) => {
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

function closeWindow() {
  window.electron.closeEditQso();
}
