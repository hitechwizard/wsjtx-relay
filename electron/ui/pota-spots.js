// POTA Spots window management
class PotaSpotsManager {
  constructor() {
    this.spots = [];
    this.filteredSpots = [];
    this.loggedQsos = [];
    this.workedQsoKeys = new Set();
    this.sortField = 'spotTime';
    this.sortDescending = true;
    this.lastUpdateTime = null;
    this.minUpdateIntervalMs = 60 * 1000; // 1 minute
    this.lastFetchTime = 0;
    this.autoRefreshTimer = null;
    this.persistedFilters = {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      hideWorked: false,
    };

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupThemeListener();
    await this.loadFilterState();
    this.applyPersistedRegionFilter();
    this.fetchSpots();
    this.startAutoRefresh();
  }

  setupEventListeners() {
    // Filter inputs
    document.getElementById('modeFilter').addEventListener('change', () => {
      this.applyFilters();
      this.saveFilterState();
    });
    document.getElementById('bandFilter').addEventListener('change', () => {
      this.applyFilters();
      this.saveFilterState();
    });
    document.getElementById('regionFilter').addEventListener('input', () => {
      this.applyFilters();
      this.saveFilterState();
    });
    document.getElementById('hideWorkedFilter').addEventListener('change', () => {
      this.applyFilters();
      this.saveFilterState();
    });

    // Column headers for sorting
    document.querySelectorAll('.pota-spots-table thead th').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e) => {
        const field = e.target.getAttribute('data-field');
        this.sortByField(field);
      });
    });

    const tableBody = document.getElementById('spotsTableBody');
    if (tableBody) {
      tableBody.addEventListener('dblclick', (event) => {
        const row = event.target.closest('tr[data-spot-index]');
        if (!row) {
          return;
        }

        const spotIndex = Number.parseInt(row.getAttribute('data-spot-index'), 10);
        if (
          !Number.isInteger(spotIndex) ||
          spotIndex < 0 ||
          spotIndex >= this.filteredSpots.length
        ) {
          return;
        }

        const selectedSpot = this.filteredSpots[spotIndex];
        this.selectSpot(selectedSpot);
      });
    }

    if (window.electron && typeof window.electron.onQsoDataRefresh === 'function') {
      window.electron.onQsoDataRefresh(async () => {
        await this.loadLoggedQsos();
        this.applyFilters();
      });
    }

    window.addEventListener('beforeunload', () => this.stopAutoRefresh());
  }

  setupThemeListener() {
    if (window.electron && window.electron.onThemeChanged) {
      window.electron.onThemeChanged((theme) => {
        document.body.className = theme === 'dark' ? 'dark-theme' : '';
      });
    }

    // Get initial theme
    if (window.electron && window.electron.getTheme) {
      window.electron.getTheme().then((theme) => {
        document.body.className = theme === 'dark' ? 'dark-theme' : '';
      });
    }
  }

  startAutoRefresh() {
    // Clear any existing timer
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

    // Auto-refresh every minute
    this.autoRefreshTimer = setInterval(() => {
      this.fetchSpots();
    }, this.minUpdateIntervalMs);
  }

  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  async selectSpot(spot) {
    if (!window.electron || typeof window.electron.selectPotaSpot !== 'function') {
      return;
    }

    try {
      await window.electron.selectPotaSpot(spot || {});
    } catch (error) {
      console.error('Failed to send selected POTA spot:', error);
    }
  }

  saveFilterState() {
    const state = {
      modeFilter: document.getElementById('modeFilter').value,
      bandFilter: document.getElementById('bandFilter').value,
      regionFilter: String(document.getElementById('regionFilter').value || '').toUpperCase(),
      hideWorked: document.getElementById('hideWorkedFilter').checked,
    };
    this.persistedFilters = { ...state };
    if (window.electron && typeof window.electron.savePotaSpotsFilters === 'function') {
      window.electron.savePotaSpotsFilters(state).catch((error) => {
        console.error('Error saving filter state:', error);
      });
    }
  }

  async loadFilterState() {
    try {
      if (window.electron && typeof window.electron.getPotaSpotsFilters === 'function') {
        const state = await window.electron.getPotaSpotsFilters();
        this.persistedFilters = {
          modeFilter: String(state?.modeFilter || ''),
          bandFilter: String(state?.bandFilter || ''),
          regionFilter: String(state?.regionFilter || '').toUpperCase(),
          hideWorked: Boolean(state?.hideWorked),
        };
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
    }
  }

  applyPersistedRegionFilter() {
    const regionInput = document.getElementById('regionFilter');
    if (regionInput) {
      regionInput.value = this.persistedFilters.regionFilter || '';
    }

    const hideWorkedInput = document.getElementById('hideWorkedFilter');
    if (hideWorkedInput) {
      hideWorkedInput.checked = Boolean(this.persistedFilters.hideWorked);
    }
  }

  applyPersistedSelectFiltersIfAvailable() {
    const modeSelect = document.getElementById('modeFilter');
    const bandSelect = document.getElementById('bandFilter');

    const persistedMode = String(this.persistedFilters.modeFilter || '');
    const persistedBand = String(this.persistedFilters.bandFilter || '');

    if (
      modeSelect &&
      persistedMode &&
      modeSelect.querySelector(`option[value="${persistedMode}"]`)
    ) {
      modeSelect.value = persistedMode;
    }

    if (
      bandSelect &&
      persistedBand &&
      bandSelect.querySelector(`option[value="${persistedBand}"]`)
    ) {
      bandSelect.value = persistedBand;
    }
  }

  async fetchSpots() {
    const now = Date.now();
    if (now - this.lastFetchTime < this.minUpdateIntervalMs && this.spots.length > 0) {
      console.log('Skipping fetch - updated less than 1 minute ago');
      return;
    }

    try {
      const [response] = await Promise.all([
        window.electron.fetchPotaSpots(),
        this.loadLoggedQsos(),
      ]);

      if (response && response.success) {
        this.spots = response.spots || [];
        this.lastUpdateTime = new Date();
        this.lastFetchTime = now;
        this.updateFilterOptions();
        this.applyFilters();
        this.updateLastUpdateDisplay();
      } else {
        console.error('Failed to fetch POTA spots:', response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching POTA spots:', error);
    }
  }

  async loadLoggedQsos() {
    if (!window.electron || typeof window.electron.getQsos !== 'function') {
      this.loggedQsos = [];
      this.workedQsoKeys = new Set();
      return;
    }

    try {
      const qsos = await window.electron.getQsos();
      this.loggedQsos = Array.isArray(qsos) ? qsos : [];
      this.workedQsoKeys = new Set(
        this.loggedQsos.map((qso) => this.getQsoMatchKey(qso)).filter(Boolean),
      );
    } catch (error) {
      console.error('Error loading logged QSOs:', error);
      this.loggedQsos = [];
      this.workedQsoKeys = new Set();
    }
  }

  updateFilterOptions() {
    const modes = new Set();
    const bands = new Set();

    this.spots.forEach((spot) => {
      if (spot.mode) {
        modes.add(spot.mode);
      }
      // Calculate band from frequency (convert kHz to MHz)
      const freqKHz = parseFloat(spot.frequency);
      if (freqKHz) {
        const freqMHz = freqKHz / 1000;
        const band = this.frequencyToBand(freqMHz);
        if (band) {
          bands.add(band);
        }
      }
    });

    // Update mode filter
    const modeSelect = document.getElementById('modeFilter');
    const currentMode = modeSelect.value;
    modeSelect.innerHTML = '<option value="">All Modes</option>';
    Array.from(modes)
      .sort()
      .forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = mode;
        modeSelect.appendChild(option);
      });
    modeSelect.value = currentMode;

    // Update band filter
    const bandSelect = document.getElementById('bandFilter');
    const currentBand = bandSelect.value;
    bandSelect.innerHTML = '<option value="">All Bands</option>';
    Array.from(bands)
      .sort()
      .forEach((band) => {
        const option = document.createElement('option');
        option.value = band;
        option.textContent = band;
        bandSelect.appendChild(option);
      });
    bandSelect.value = currentBand;

    this.applyPersistedSelectFiltersIfAvailable();
  }

  frequencyToBand(freqMHz) {
    // Common amateur radio bands
    const bands = [
      { name: '160m', min: 1.8, max: 2.0 },
      { name: '80m', min: 3.5, max: 4.0 },
      { name: '60m', min: 5.3, max: 5.4 },
      { name: '40m', min: 7.0, max: 7.3 },
      { name: '30m', min: 10.1, max: 10.15 },
      { name: '20m', min: 14.0, max: 14.35 },
      { name: '17m', min: 18.068, max: 18.168 },
      { name: '15m', min: 21.0, max: 21.45 },
      { name: '12m', min: 24.89, max: 24.99 },
      { name: '10m', min: 28.0, max: 29.7 },
      { name: '6m', min: 50.0, max: 54.0 },
      { name: '2m', min: 144.0, max: 148.0 },
      { name: '70cm', min: 420.0, max: 450.0 },
      { name: '33cm', min: 902.0, max: 928.0 },
      { name: '23cm', min: 1240.0, max: 1300.0 },
    ];

    for (const band of bands) {
      if (freqMHz >= band.min && freqMHz <= band.max) {
        return band.name;
      }
    }

    return null;
  }

  getModeMatchKey(modeValue, submodeValue) {
    const mode = String(modeValue || '')
      .trim()
      .toUpperCase();
    const submode = String(submodeValue || '')
      .trim()
      .toUpperCase();
    return mode === 'MFSK' && submode ? submode : mode;
  }

  getIsoDatePart(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return '';
    }

    if (/^\d{8}$/.test(rawValue)) {
      return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
      return rawValue.slice(0, 10);
    }

    const parsedDate = this.parseSpotTime(rawValue) || new Date(rawValue);
    return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
  }

  getQsoMatchKey(qso) {
    if (!qso) {
      return '';
    }

    const call = String(qso.call || qso.dxCall || '')
      .trim()
      .toUpperCase();
    const band = String(qso.band || '')
      .trim()
      .toUpperCase();
    const mode = this.getModeMatchKey(qso.mode, qso.submode);
    const date =
      this.getIsoDatePart(qso.start || qso.end) ||
      this.getIsoDatePart(qso.qso_date || qso.date_on || qso.qso_date_off || qso.date_off);

    if (!call || !band || !mode || !date) {
      return '';
    }

    return `${call}|${band}|${mode}|${date}`;
  }

  getSpotMatchKey(spot) {
    if (!spot) {
      return '';
    }

    const call = String(spot.activator || '')
      .trim()
      .toUpperCase();
    const band = String(this.frequencyToBand((parseFloat(spot.frequency) || 0) / 1000) || '')
      .trim()
      .toUpperCase();
    const mode = this.getModeMatchKey(spot.mode, '');
    const date = this.getIsoDatePart(spot.spotTime);

    if (!call || !band || !mode || !date) {
      return '';
    }

    return `${call}|${band}|${mode}|${date}`;
  }

  isWorkedSpot(spot) {
    const spotKey = this.getSpotMatchKey(spot);
    return Boolean(spotKey) && this.workedQsoKeys.has(spotKey);
  }

  applyFilters() {
    const modeFilter = document.getElementById('modeFilter').value.toUpperCase();
    const bandFilter = document.getElementById('bandFilter').value;
    const regionFilter = document.getElementById('regionFilter').value.toUpperCase();
    const hideWorked = document.getElementById('hideWorkedFilter').checked;

    this.filteredSpots = this.spots.filter((spot) => {
      if (hideWorked && this.isWorkedSpot(spot)) {
        return false;
      }

      // Mode filter
      if (modeFilter && String(spot.mode || '').toUpperCase() !== modeFilter) {
        return false;
      }

      // Band filter
      if (bandFilter) {
        const freqKHz = parseFloat(spot.frequency);
        const freqMHz = freqKHz / 1000;
        const band = this.frequencyToBand(freqMHz);
        if (band !== bandFilter) {
          return false;
        }
      }

      // Region filter (first 2 chars of locationDesc)
      if (regionFilter) {
        const location = String(spot.locationDesc || '').toUpperCase();
        if (!location.startsWith(regionFilter)) {
          return false;
        }
      }

      return true;
    });

    this.sortSpots();
    this.render();
  }

  sortByField(field) {
    if (this.sortField === field) {
      this.sortDescending = !this.sortDescending;
    } else {
      this.sortField = field;
      this.sortDescending = true;
    }

    // Update header visual indicators
    document.querySelectorAll('.pota-spots-table thead th').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.getAttribute('data-field') === field) {
        th.classList.add(this.sortDescending ? 'sort-desc' : 'sort-asc');
      }
    });

    this.sortSpots();
    this.render();
  }

  sortSpots() {
    this.filteredSpots.sort((a, b) => {
      let aVal = a[this.sortField];
      let bVal = b[this.sortField];

      // Handle numeric fields
      if (this.sortField === 'frequency') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }

      if (this.sortField === 'age') {
        aVal = this.getSpotAgeMinutes(a.spotTime);
        bVal = this.getSpotAgeMinutes(b.spotTime);
      }

      // Handle datetime
      if (this.sortField === 'spotTime') {
        aVal = this.parseSpotTime(aVal)?.getTime() || 0;
        bVal = this.parseSpotTime(bVal)?.getTime() || 0;
      }

      // Case-insensitive string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toUpperCase();
        bVal = bVal.toUpperCase();
      }

      if (aVal < bVal) {
        return this.sortDescending ? 1 : -1;
      }
      if (aVal > bVal) {
        return this.sortDescending ? -1 : 1;
      }
      return 0;
    });
  }

  formatFrequency(freqKHz) {
    const freq = parseFloat(freqKHz);
    if (Number.isNaN(freq)) {
      return String(freqKHz || '');
    }
    // Convert from kHz to MHz
    const freqMHz = freq / 1000;
    return freqMHz.toFixed(4);
  }

  formatSpotTime(timeStr) {
    try {
      // Handle ISO format (e.g., "2024-03-11T14:30:45Z")
      const isoStr = String(timeStr || '').trim();
      const parts = isoStr.split('T');
      if (parts.length >= 2) {
        const datePart = parts[0];
        const timePart = parts[1];
        // Format: MM-DD @ HH:MM
        return `${datePart.substr(5, 5)} @ ${timePart.substr(0, 5)}`;
      }

      // Fallback: try to parse as date
      const date = new Date(timeStr);
      if (Number.isNaN(date.getTime())) {
        return String(timeStr || '');
      }

      const isoFormatted = date.toISOString();
      const fallbackParts = isoFormatted.split('T');
      if (fallbackParts.length >= 2) {
        const datePart = fallbackParts[0];
        const timePart = fallbackParts[1];
        return `${datePart.substr(5, 5)} @ ${timePart.substr(0, 5)}`;
      }

      return String(timeStr || '');
    } catch {
      return String(timeStr || '');
    }
  }

  parseSpotTime(timeStr) {
    const rawValue = String(timeStr || '').trim();
    if (!rawValue) {
      return null;
    }

    const normalizedValue = /Z$|[+-]\d{2}:?\d{2}$/.test(rawValue) ? rawValue : `${rawValue}Z`;
    const parsedDate = new Date(normalizedValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  getSpotAgeMinutes(timeStr) {
    const spotDate = this.parseSpotTime(timeStr);
    if (!spotDate) {
      return 0;
    }

    const ageMs = Date.now() - spotDate.getTime();
    return Math.max(0, Math.floor(ageMs / 60000));
  }

  formatSpotAge(timeStr) {
    return `${this.getSpotAgeMinutes(timeStr)}m`;
  }

  render() {
    const tbody = document.getElementById('spotsTableBody');
    const noSpotsMsg = document.getElementById('noSpotsMessage');

    if (this.filteredSpots.length === 0) {
      tbody.innerHTML = '';
      noSpotsMsg.style.display = 'block';
      return;
    }

    noSpotsMsg.style.display = 'none';
    tbody.innerHTML = this.filteredSpots
      .map((spot, index) => {
        const row = document.createElement('tr');
        const isWorked = this.isWorkedSpot(spot);
        const activator = this.escapeHtml(spot.activator || '');
        const workedBadge = isWorked ? '<span class="pota-worked-badge">Worked</span>' : '';
        row.className = isWorked ? 'pota-spot-row pota-spot-worked' : 'pota-spot-row';
        row.setAttribute('data-spot-index', String(index));
        row.title = isWorked
          ? 'Already worked today. Double-click to populate Manual QSO fields'
          : 'Double-click to populate Manual QSO fields';
        row.innerHTML = `
          <td class="pota-activator-cell"><span>${activator}</span>${workedBadge}</td>
          <td>${this.formatFrequency(spot.frequency)}</td>
          <td>${this.escapeHtml(spot.mode || '')}</td>
          <td>${this.escapeHtml(spot.reference || '')}</td>
          <td>${this.escapeHtml(spot.name || '')}</td>
          <td>${this.escapeHtml(spot.locationDesc || '')}</td>
          <td>${this.formatSpotTime(spot.spotTime)}</td>
          <td>${this.formatSpotAge(spot.spotTime)}</td>
        `;
        return row.outerHTML;
      })
      .join('');
  }

  updateLastUpdateDisplay() {
    const lastUpdateEl = document.getElementById('lastUpdateTime');
    if (this.lastUpdateTime) {
      const timeStr = this.lastUpdateTime.toLocaleTimeString();
      lastUpdateEl.textContent = `— updated ${timeStr}`;
      document.title = `POTA Spots — updated ${timeStr}`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  window.potaSpotsManager = new PotaSpotsManager();
});
