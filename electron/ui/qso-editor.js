const qsoListContainer = document.getElementById('qsoListContainer');
const callsignFilterInput = document.getElementById('callsignFilterInput');
const saveQsoChanges = document.getElementById('saveQsoChanges');
const cancelQsoChanges = document.getElementById('cancelQsoChanges');
const importQsosBtn = document.getElementById('importQsosBtn');
const exportQsosBtn = document.getElementById('exportQsosBtn');
const resendAllQsosBtn = document.getElementById('resendAllQsosBtn');
const setMyParkBtn = document.getElementById('setMyParkBtn');
const addBlankQsoBtn = document.getElementById('addBlankQsoBtn');
const rawDataModal = document.getElementById('rawDataModal');
const rawDataModalContent = document.getElementById('rawDataModalContent');
const closeRawDataModalBtn = document.getElementById('closeRawDataModalBtn');
const setMyParkModal = document.getElementById('setMyParkModal');
const parkReferenceInput = document.getElementById('parkReferenceInput');
const parkValidationError = document.getElementById('parkValidationError');
const closeParkModalBtn = document.getElementById('closeParkModalBtn');
const cancelParkBtn = document.getElementById('cancelParkBtn');
const confirmParkBtn = document.getElementById('confirmParkBtn');

const qsoFields = window.wsjtxQsoFields || {};
const normalizeCalculatedFields = window.wsjtxNormalizeCalculatedFields || (() => {});
const visibleQsoFields = Object.entries(qsoFields).filter(([, config]) => !config.hidden);

if (
  !window.wsjtxQsoFields ||
  typeof window.wsjtxFreqToBand !== 'function' ||
  typeof window.wsjtxNormalizeCalculatedFields !== 'function'
) {
  showSharedConfigWarning();
}

let qsos = [];
let settings = {};
let changedQsos = new Set();
let hasUnsavedChanges = false;
let filterValue = '';
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
      console.error('Failed to dispose QSO editor subscription:', error);
    }
  }
}

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
  setMyParkBtn.addEventListener('click', handleSetMyPark);
  if (addBlankQsoBtn) {
    addBlankQsoBtn.addEventListener('click', handleAddBlankQso);
  }
  if (closeRawDataModalBtn) {
    closeRawDataModalBtn.addEventListener('click', closeRawDataModal);
  }
  if (rawDataModal) {
    rawDataModal.addEventListener('click', (e) => {
      if (e.target?.dataset?.action === 'close-raw-modal') {
        closeRawDataModal();
      }
    });
  }
  if (setMyParkModal) {
    setMyParkModal.addEventListener('click', (e) => {
      if (e.target?.dataset?.action === 'close-park-modal') {
        closeParkModal();
      }
    });
  }
  if (closeParkModalBtn) {
    closeParkModalBtn.addEventListener('click', closeParkModal);
  }
  if (cancelParkBtn) {
    cancelParkBtn.addEventListener('click', closeParkModal);
  }
  if (confirmParkBtn) {
    confirmParkBtn.addEventListener('click', confirmSetMyPark);
  }
  if (parkReferenceInput) {
    parkReferenceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmSetMyPark();
      }
    });
  }
  if (callsignFilterInput) {
    callsignFilterInput.addEventListener('input', handleFilterChange);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rawDataModal && !rawDataModal.hidden) {
      closeRawDataModal();
    }
    if (e.key === 'Escape' && setMyParkModal && !setMyParkModal.hidden) {
      closeParkModal();
    }
  });

  // Theme change listener
  addSubscriptionDisposer(
    window.electron.onThemeChanged((theme) => {
      applyTheme(theme);
    }),
  );

  window.addEventListener('beforeunload', () => {
    disposeSubscriptions();
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
    [qsos, settings] = await Promise.all([
      window.electron.getQsos(),
      window.electron.getSettings(),
    ]);
    qsos.forEach(normalizeCalculatedFields);
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

function handleFilterChange(e) {
  filterValue = (e.target.value || '').toUpperCase().trim();
  renderQsoList();
}

function getDisplayedQsos() {
  if (!filterValue) {
    return qsos.map((qso, index) => ({ qso, index }));
  }
  return qsos
    .map((qso, index) => ({ qso, index }))
    .filter(({ qso }) =>
      String(qso.call || '')
        .toUpperCase()
        .includes(filterValue),
    );
}

function renderQsoList() {
  qsoListContainer.innerHTML = '';

  const displayedQsos = getDisplayedQsos();

  if (qsos.length === 0) {
    qsoListContainer.innerHTML = '<p class="qso-editor-empty-state">No QSO records found</p>';
    return;
  }

  if (displayedQsos.length === 0) {
    qsoListContainer.innerHTML =
      '<p class="qso-editor-empty-state">No QSO records match the filter</p>';
    return;
  }

  displayedQsos.forEach(({ qso, index }) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'qso-editor-card';
    itemDiv.dataset.index = index;

    const qrzSuccess = qso.logSubmissions?.qrz?.success === true;
    const clublogSuccess = qso.logSubmissions?.clublog?.success === true;
    const showResubmitQrz = settings?.qrzLoggingEnabled && !qrzSuccess;
    const showResubmitClublog = settings?.clublogLoggingEnabled && !clublogSuccess;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'qso-editor-card-header';
    headerDiv.innerHTML = `
      <div>
        <strong>${qso.call || '—'}</strong> on <strong>${qso.band || '—'} ${qso.submode || qso.mode}</strong>
        <div class="qso-card-meta">${formatDateTime(qso.start || qso.end)}</div>
      </div>
      <div class="qso-card-actions">
        <button class="btn btn-secondary btn-sm btn-raw-data" data-index="${index}">Raw Data</button>
        <button class="btn btn-secondary btn-sm btn-resend" data-index="${index}">Resend</button>
        ${showResubmitQrz ? `<button class="btn btn-secondary btn-sm btn-resubmit" data-index="${index}" data-provider="qrz" title="Resubmit to QRZ logbook">Resubmit QRZ</button>` : ''}
        ${showResubmitClublog ? `<button class="btn btn-secondary btn-sm btn-resubmit" data-index="${index}" data-provider="clublog" title="Resubmit to Clublog">Resubmit Clublog</button>` : ''}
        <button class="btn btn-danger btn-sm btn-delete" data-index="${index}">Delete</button>
        <button class="btn btn-secondary btn-sm btn-toggle-qso" data-index="${index}" title="Show/Hide QSO">▼</button>
      </div>
    `;

    const formDiv = document.createElement('div');
    formDiv.className = 'qso-editor-fields hidden';
    formDiv.innerHTML = buildQsoFieldsHtml(qso, index);

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

  qsoListContainer.querySelectorAll('.btn-toggle-qso').forEach((btn) => {
    btn.addEventListener('click', handleToggleQso);
  });

  qsoListContainer.querySelectorAll('.btn-raw-data').forEach((btn) => {
    btn.addEventListener('click', handleRawDataView);
  });

  qsoListContainer.querySelectorAll('.btn-resubmit').forEach((btn) => {
    btn.addEventListener('click', handleResubmitQsoLog);
  });
}

function handleToggleQso(e) {
  const btn = e.target;
  const card = btn.closest('.qso-editor-card');
  const fieldsDiv = card.querySelector('.qso-editor-fields');

  fieldsDiv.classList.toggle('hidden');

  if (fieldsDiv.classList.contains('hidden')) {
    btn.textContent = '▼';
    btn.setAttribute('aria-expanded', 'false');
  } else {
    btn.textContent = '▲';
    btn.setAttribute('aria-expanded', 'true');
  }
}

function handleRawDataView(e) {
  const index = parseInt(e.target.dataset.index, 10);
  const qso = qsos[index];
  if (!qso) {
    return;
  }

  openRawDataModal(qso);
}

async function handleResubmitQsoLog(e) {
  const btn = e.target;
  const index = parseInt(btn.dataset.index, 10);
  const provider = btn.dataset.provider;
  const providerLabel = provider === 'qrz' ? 'QRZ' : 'Clublog';
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await window.electron.resubmitQsoLog(index, provider);
    if (result.success) {
      if (result.qso) {
        qsos[index] = result.qso;
        normalizeCalculatedFields(qsos[index]);
      }
      btn.remove();
    } else {
      alert(`Resubmit to ${providerLabel} failed: ${result.error || 'Unknown error'}`);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (err) {
    alert(`Resubmit to ${providerLabel} error: ${err.message || err}`);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function formatRawValue(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function openRawDataModal(qso) {
  if (!rawDataModal || !rawDataModalContent) {
    return;
  }

  const entries = Object.entries(qso || {});

  if (entries.length === 0) {
    rawDataModalContent.innerHTML =
      '<p class="qso-raw-empty">No raw fields available for this QSO.</p>';
  } else {
    const rows = entries
      .map(
        ([fieldName, value]) => `
          <div class="qso-raw-row">
            <div class="qso-raw-key">${escapeHtml(fieldName)}</div>
            <div class="qso-raw-value">${escapeHtml(formatRawValue(value))}</div>
          </div>`,
      )
      .join('');
    rawDataModalContent.innerHTML = rows;
  }

  rawDataModal.hidden = false;
}

function closeRawDataModal() {
  if (!rawDataModal || !rawDataModalContent) {
    return;
  }

  rawDataModal.hidden = true;
  rawDataModalContent.innerHTML = '';
}

function handleFieldChange(e) {
  const index = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  let nextValue = preprocessFieldValue(field, e.target.value);
  e.target.value = nextValue;

  const validationError = validateFieldValue(field, nextValue);
  if (validationError) {
    e.target.setCustomValidity(validationError);
    e.target.reportValidity();
    e.target.value = qsos[index][field] || '';
    return;
  }

  e.target.setCustomValidity('');
  qsos[index][field] = nextValue;
  normalizeCalculatedFields(qsos[index]);
  syncCalculatedFieldValues(index, e.target.closest('.qso-editor-card'));
  changedQsos.add(index);
  hasUnsavedChanges = true;

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
    hasUnsavedChanges = true;
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

function createBlankQso() {
  const blankQso = {};

  Object.keys(qsoFields).forEach((fieldName) => {
    blankQso[fieldName] = '';
  });

  blankQso.start = new Date().toISOString();
  normalizeCalculatedFields(blankQso);
  return blankQso;
}

function handleAddBlankQso() {
  const blankQso = createBlankQso();
  qsos.push(blankQso);

  const newIndex = qsos.length - 1;
  changedQsos.add(newIndex);
  hasUnsavedChanges = true;

  renderQsoList();

  const newCard = qsoListContainer.querySelector(`.qso-editor-card[data-index="${newIndex}"]`);
  if (newCard) {
    newCard.classList.add('changed');
    const firstEditableField =
      newCard.querySelector('.qso-field:not([readonly]):not([disabled])[data-field="call"]') ||
      newCard.querySelector('.qso-field:not([readonly]):not([disabled])');

    if (firstEditableField) {
      firstEditableField.focus();
      if (typeof firstEditableField.select === 'function') {
        firstEditableField.select();
      }
    }

    newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    qsos.forEach(normalizeCalculatedFields);
    await window.electron.updateQsos(qsos);
    // Notify the main window to refresh the QSO log
    window.electron.notifyQsoDataChanged();
    changedQsos.clear();
    hasUnsavedChanges = false;
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

function buildQsoFieldsHtml(qso, index) {
  return visibleQsoFields
    .map(([fieldName, config]) => {
      const value = qso[fieldName] ?? '';
      const label = escapeHtml(config.label || fieldName);

      if (config.type === 'enum' && Array.isArray(config.values)) {
        const optionsHtml = config.values
          .map((option) => {
            const optionValue = String(option ?? '');
            const selected = String(value) === optionValue ? ' selected' : '';
            return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(optionValue)}</option>`;
          })
          .join('');

        const disabledAttr = config.readOnly ? ' disabled' : '';

        return `
      <div class="editor-field">
        <label>${label}</label>
        <select class="qso-field" data-field="${fieldName}" data-index="${index}"${disabledAttr}>
          ${optionsHtml}
        </select>
      </div>`;
      }

      const inputType = config.type === 'number' ? 'number' : 'text';
      const patternAttr = config.pattern ? ` pattern="${escapeHtml(config.pattern)}"` : '';
      const readonlyAttr = config.readOnly ? ' readonly disabled' : '';
      const stepAttr = inputType === 'number' ? ' step="any"' : '';

      return `
      <div class="editor-field">
        <label>${label}</label>
        <input type="${inputType}" class="qso-field" data-field="${fieldName}" data-index="${index}" value="${escapeHtml(String(value))}"${stepAttr}${patternAttr}${readonlyAttr} />
      </div>`;
    })
    .join('');
}

function syncCalculatedFieldValues(index, card) {
  if (!card) {
    return;
  }

  const qso = qsos[index];
  const bandControl = card.querySelector('.qso-field[data-field="band"]');
  if (bandControl) {
    bandControl.value = qso.band || '';
  }
}

function validateFieldValue(fieldName, value) {
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

function preprocessFieldValue(fieldName, value) {
  let next = String(value || '');

  if (
    fieldName === 'gridsquare' ||
    fieldName === 'my_gridsquare' ||
    fieldName === 'call' ||
    fieldName === 'station_callsign' ||
    fieldName === 'my_state' ||
    fieldName === 'state' ||
    fieldName === 'sig_info' ||
    fieldName === 'my_sig_info'
  ) {
    next = next.toUpperCase();
  }

  if ((fieldName === 'sig_info' || fieldName === 'my_sig_info') && /^[0-9]{4,5}$/.test(next)) {
    next = `US-${next}`;
  }

  return next;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addSuccessMessage(msg) {
  // Simple success notification
  console.log('Success:', msg);
}

function addErrorMessage(msg) {
  // Simple error notification
  console.error('Error:', msg);
}

function showSharedConfigWarning() {
  const banner = document.createElement('div');
  banner.className = 'shared-config-warning';
  banner.textContent = 'Warning: shared QSO field config failed to load (qso-fields.js).';
  document.body.insertBefore(banner, document.body.firstChild);
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
      const shouldMerge = confirm(
        `Import ${importedCount} QSOs from file? They will be added to your current list.`,
      );

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
    const shouldResend = confirm(`Resend ${qsos.length} QSOs?`);
    if (shouldResend) {
      const result = await window.electron.resendAllQsos();
      if (result.success) {
        alert(`✓ ${result.count} QSOs resent to forwarders successfully`);
        addSuccessMessage(`${result.count} QSOs resent to forwarders`);
      } else {
        alert(`✗ Failed to resend QSOs: ${result.error || 'Unknown error'}`);
        addErrorMessage(result.error || 'Failed to resend QSOs');
      }
    }
  } catch (err) {
    alert(`✗ Resend error: ${err.message}`);
    addErrorMessage(`Resend error: ${err.message}`);
  }
}

function handleSetMyPark() {
  openParkModal();
}

function openParkModal() {
  if (!setMyParkModal || !parkReferenceInput || !parkValidationError) {
    return;
  }

  parkReferenceInput.value = '';
  parkValidationError.textContent = '';
  setMyParkModal.hidden = false;

  // Focus input after modal is shown
  setTimeout(() => {
    parkReferenceInput.focus();
  }, 100);
}

function closeParkModal() {
  if (!setMyParkModal || !parkReferenceInput || !parkValidationError) {
    return;
  }

  setMyParkModal.hidden = true;
  parkReferenceInput.value = '';
  parkValidationError.textContent = '';
}

function confirmSetMyPark() {
  const parkRef = parkReferenceInput?.value;

  if (!parkRef) {
    parkValidationError.textContent = 'Please enter a park reference';
    return;
  }

  const normalized = parkRef.trim().toUpperCase();

  // Validate park reference format: XX-#### or XX-#####
  const parkPattern = /^[A-Z]{2}-[0-9]{4}[0-9]?$/;
  if (!parkPattern.test(normalized)) {
    parkValidationError.textContent =
      'Invalid format. Expected: XX-#### or XX-##### (e.g., US-1234 or K-12345)';
    return;
  }

  // Update all QSOs
  let updatedCount = 0;
  qsos.forEach((qso, index) => {
    qso.my_sig_info = normalized;
    qso.my_sig = 'POTA';
    changedQsos.add(index);
    updatedCount++;
  });

  hasUnsavedChanges = true;

  // Close modal
  closeParkModal();

  // Re-render to show updated values
  renderQsoList();

  addSuccessMessage(`Updated ${updatedCount} QSO(s) with My Park: ${normalized}`);
}

function closeWindow() {
  if (hasUnsavedChanges || changedQsos.size > 0) {
    const shouldClose = confirm('You have unsaved changes. Close without saving?');
    if (!shouldClose) {
      return;
    }
  }
  // Notify the main window to refresh the QSO log
  window.electron.notifyQsoDataChanged();
  window.electron.closeQsoEditor();
}
