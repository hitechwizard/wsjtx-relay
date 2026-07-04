class DxSummitSpotsManager {
  constructor() {
    this.spots = [];
    this.filteredSpots = [];
    this.loggedQsos = [];
    this.workedQsoKeys = new Set();
    this.workedQsoDigiKeys = new Set();
    this.workedMatchFields = ['call', 'band', 'mode', 'date'];
    this.decodeSightingsByCallsign = new Map();
    this.decodeSightingExpirationMinutes = 5;
    this.sortField = 'spotTime';
    this.sortDescending = true;
    this.lastUpdateTime = null;
    this.minUpdateIntervalMs = 60 * 1000;
    this.lastFetchTime = 0;
    this.autoRefreshTimer = null;
    this.utcClockTimer = null;
    this.decodeSightingCleanupTimer = null;
    this.subscriptionDisposers = [];
    this.currentTxStatus = {
      dxCall: '',
      txEnabled: false,
      transmitting: false,
    };
    this.stationCallsign = '';
    this.persistedFilters = {
      modeFilter: '',
      bandFilter: '',
      regionFilter: '',
      callFilter: '',
      hideWorked: false,
      hideQrt: false,
    };

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupThemeListener();
    this.startUtcClock();
    await this.loadDecodeSightingSettings();
    await this.loadFilterState();
    this.applyPersistedFilters();
    await this.fetchSpots();
    this.startAutoRefresh();
    this.startDecodeSightingCleanupTimer();
  }

  setupEventListeners() {
    ['modeFilter', 'bandFilter', 'hideWorkedFilter', 'hideQrtFilter'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.applyFilters();
          this.saveFilterState();
        });
      }
    });

    ['regionFilter', 'callFilter'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', (event) => {
          if (id === 'regionFilter') {
            event.target.value = String(event.target.value || '').toUpperCase();
          }
          this.applyFilters();
          this.saveFilterState();
        });
      }
    });

    document.querySelectorAll('.pota-spots-table thead th').forEach((th) => {
      const field = th.getAttribute('data-field');
      if (!field) {
        return;
      }

      th.addEventListener('click', (e) => {
        const nextField = e.target.getAttribute('data-field');
        if (!nextField) {
          return;
        }
        this.sortByField(nextField);
      });
    });

    const tableBody = document.getElementById('spotsTableBody');
    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        const actionButton = event.target.closest('button.pota-action-btn[data-spot-index]');
        if (!actionButton) {
          return;
        }

        const spotIndex = Number.parseInt(actionButton.getAttribute('data-spot-index'), 10);
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
      this.addSubscriptionDisposer(
        window.electron.onQsoDataRefresh(async () => {
          await this.loadLoggedQsos();
          this.applyFilters();
        }),
      );
    }

    if (window.electron && typeof window.electron.onRelayDecodePacket === 'function') {
      this.addSubscriptionDisposer(
        window.electron.onRelayDecodePacket((packet) => {
          this.recordDecodePacket(packet);
        }),
      );
    }

    if (window.electron && typeof window.electron.onRelayClearPacket === 'function') {
      this.addSubscriptionDisposer(
        window.electron.onRelayClearPacket(() => {
          this.handleClearPacket();
        }),
      );
    }

    if (window.electron && typeof window.electron.onSettingsChanged === 'function') {
      this.addSubscriptionDisposer(
        window.electron.onSettingsChanged((settings) => {
          this.applyDecodeSightingSettings(settings);
          this.applyWorkedMatchSettings(settings);
          this.loadLoggedQsos().then(() => this.applyFilters());
        }),
      );
    }

    if (window.electron && typeof window.electron.onRelayStatusUpdate === 'function') {
      this.addSubscriptionDisposer(
        window.electron.onRelayStatusUpdate((statusData) => {
          this.handleRelayStatusUpdate(statusData);
        }),
      );
    }

    window.addEventListener('beforeunload', () => {
      this.saveFilterState();
      this.stopUtcClock();
      this.stopAutoRefresh();
      this.stopDecodeSightingCleanupTimer();
      this.disposeSubscriptions();
    });
  }

  setupThemeListener() {
    if (window.electron && window.electron.onThemeChanged) {
      this.addSubscriptionDisposer(
        window.electron.onThemeChanged((theme) => {
          document.body.className = theme === 'dark' ? 'dark-theme' : '';
        }),
      );
    }

    if (window.electron && window.electron.getTheme) {
      window.electron.getTheme().then((theme) => {
        document.body.className = theme === 'dark' ? 'dark-theme' : '';
      });
    }
  }

  addSubscriptionDisposer(disposer) {
    if (typeof disposer === 'function') {
      this.subscriptionDisposers.push(disposer);
    }
  }

  disposeSubscriptions() {
    while (this.subscriptionDisposers.length > 0) {
      const disposer = this.subscriptionDisposers.pop();
      try {
        disposer();
      } catch (error) {
        console.error('Failed to dispose DX Summit listener:', error);
      }
    }
  }

  startUtcClock() {
    this.stopUtcClock();
    this.updateUtcClockDisplay();
    this.utcClockTimer = setInterval(() => {
      this.updateUtcClockDisplay();
    }, 1000);
  }

  stopUtcClock() {
    if (this.utcClockTimer) {
      clearInterval(this.utcClockTimer);
      this.utcClockTimer = null;
    }
  }

  updateUtcClockDisplay() {
    const utcNowEl = document.getElementById('utcClockTime');
    const utcRemainingEl = document.getElementById('utcDayRemaining');
    if (!utcNowEl && !utcRemainingEl) {
      return;
    }

    const now = new Date();
    const utcNowSeconds =
      now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const utcDaySeconds = 24 * 3600;
    const remainingSeconds = utcDaySeconds - utcNowSeconds;

    if (utcNowEl) {
      utcNowEl.textContent = this.formatHms(utcNowSeconds);
    }

    if (utcRemainingEl) {
      utcRemainingEl.textContent = this.formatHms(remainingSeconds);
    }
  }

  formatHms(totalSeconds) {
    const numericSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(numericSeconds / 3600);
    const minutes = Math.floor((numericSeconds % 3600) / 60);
    const seconds = numericSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async loadDecodeSightingSettings() {
    if (!window.electron || typeof window.electron.getSettings !== 'function') {
      return;
    }

    try {
      const settings = await window.electron.getSettings();
      this.applyDecodeSightingSettings(settings);
      this.applyWorkedMatchSettings(settings);
    } catch (error) {
      console.error('Error loading decode sighting settings:', error);
    }
  }

  normalizeWorkedMatchFields(values) {
    const allowed = new Set(['call', 'band', 'mode', 'date']);
    const normalized = Array.isArray(values)
      ? values
          .map((value) =>
            String(value || '')
              .trim()
              .toLowerCase(),
          )
          .filter((value) => allowed.has(value))
      : [];
    return Array.from(new Set(normalized));
  }

  applyWorkedMatchSettings(settings) {
    const normalizedFields = this.normalizeWorkedMatchFields(settings?.dxSummitWorkedMatchFields);
    this.workedMatchFields =
      normalizedFields.length > 0 ? normalizedFields : ['call', 'band', 'mode', 'date'];
  }

  applyDecodeSightingSettings(settings) {
    const minutes = Number.parseInt(settings?.decodeSightingExpirationMinutes, 10);
    if (!Number.isInteger(minutes) || minutes < 0) {
      return;
    }

    this.decodeSightingExpirationMinutes = minutes;
    if (this.pruneExpiredDecodeSightings()) {
      this.applyFilters();
    }
  }

  getDecodeSightingExpirationMs() {
    if (
      !Number.isFinite(this.decodeSightingExpirationMinutes) ||
      this.decodeSightingExpirationMinutes <= 0
    ) {
      return 0;
    }

    return this.decodeSightingExpirationMinutes * 60 * 1000;
  }

  isDecodeSightingExpired(sighting, now = Date.now()) {
    const expirationMs = this.getDecodeSightingExpirationMs();
    if (expirationMs <= 0) {
      return false;
    }

    const seenAt = Number(sighting?.seenAt);
    if (!Number.isFinite(seenAt)) {
      return true;
    }

    return now - seenAt >= expirationMs;
  }

  pruneExpiredDecodeSightings() {
    const expirationMs = this.getDecodeSightingExpirationMs();
    if (expirationMs <= 0 || this.decodeSightingsByCallsign.size === 0) {
      return false;
    }

    const now = Date.now();
    let removedCount = 0;

    Array.from(this.decodeSightingsByCallsign.entries()).forEach(([callsign, sighting]) => {
      if (this.isDecodeSightingExpired(sighting, now)) {
        this.decodeSightingsByCallsign.delete(callsign);
        removedCount += 1;
      }
    });

    return removedCount > 0;
  }

  startDecodeSightingCleanupTimer() {
    if (this.decodeSightingCleanupTimer) {
      clearInterval(this.decodeSightingCleanupTimer);
    }

    this.decodeSightingCleanupTimer = setInterval(() => {
      if (this.pruneExpiredDecodeSightings()) {
        this.applyFilters();
      }
    }, 15000);
  }

  stopDecodeSightingCleanupTimer() {
    if (this.decodeSightingCleanupTimer) {
      clearInterval(this.decodeSightingCleanupTimer);
      this.decodeSightingCleanupTimer = null;
    }
  }

  startAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

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

  async fetchSpots() {
    const now = Date.now();
    if (now - this.lastFetchTime < this.minUpdateIntervalMs && this.spots.length > 0) {
      return;
    }

    try {
      const [response] = await Promise.all([
        window.electron.fetchDxSummitSpots(),
        this.loadLoggedQsos(),
      ]);

      if (response && response.success) {
        const normalized = this.normalizeSpots(response.spots || []);
        this.spots = this.reduceToLatestSpotByCallAndBand(normalized);
        this.lastUpdateTime = new Date();
        this.lastFetchTime = now;
        this.clearApiError();
        this.updateFilterOptions();
        this.applyFilters();
        this.updateLastUpdateDisplay();
      } else {
        const message = response?.error || 'Unknown error';
        console.error('Failed to fetch DX Summit spots:', message);
        this.showApiError(`Unable to reach DX Summit API: ${message}`);
      }
    } catch (error) {
      console.error('Error fetching DX Summit spots:', error);
      this.showApiError(`Unable to reach DX Summit API: ${error?.message || error}`);
    }
  }

  showApiError(message) {
    const apiErrorElement = document.getElementById('dxSummitApiError');
    if (!apiErrorElement) {
      return;
    }

    apiErrorElement.textContent = message;
    apiErrorElement.hidden = false;
  }

  clearApiError() {
    const apiErrorElement = document.getElementById('dxSummitApiError');
    if (!apiErrorElement) {
      return;
    }

    apiErrorElement.hidden = true;
    apiErrorElement.textContent = '';
  }

  normalizeSpots(spots) {
    return (Array.isArray(spots) ? spots : []).map((spot) => ({
      info: String(spot?.info || '').trim(),
      dxCall: String(spot?.dx_call || '')
        .trim()
        .toUpperCase(),
      mode: this.deriveModeFromSpot(spot),
      frequency: String(spot?.frequency || spot?.frequency_khz || ''),
      comments: String(spot?.info || spot?.comments || '').trim(),
      location: String(spot?.dx_country || '').trim(),
      spotTime: String(spot?.time || spot?.spotTime || '').trim(),
      rawSpot: spot,
    }));
  }

  deriveModeFromSpot(spot) {
    const explicitMode = String(spot?.mode || '')
      .trim()
      .toUpperCase();
    if (explicitMode) {
      return explicitMode;
    }

    const info = String(spot?.info || '')
      .trim()
      .toUpperCase();
    if (!info) {
      return '';
    }

    const modePatterns = [
      ['FT8', /\bFT8\b/],
      ['FT4', /\bFT4\b/],
      ['CW', /\bCW\b/],
      ['SSB', /\bSSB\b/],
      ['SSB', /\bUSB\b|\bLSB\b|\bPHONE\b|\bPH\b/],
      ['RTTY', /\bRTTY\b/],
      ['PSK31', /\bPSK31\b/],
      ['PSK', /\bPSK\b/],
      ['JT65', /\bJT65\b/],
      ['JT9', /\bJT9\b/],
      ['DIGI', /\bDIGI\b|\bDIGITAL\b/],
    ];

    const match = modePatterns.find(([, pattern]) => pattern.test(info));
    return match ? match[0] : '';
  }

  reduceToLatestSpotByCallAndBand(spots) {
    const byCallAndBand = new Map();

    spots.forEach((spot) => {
      if (!spot.dxCall) {
        return;
      }

      const freqMHz = this.parseFrequencyMHz(spot.frequency);
      const band = this.frequencyToBand(freqMHz) || 'UNKNOWN';
      const dedupeKey = `${spot.dxCall}|${band}`;

      const existing = byCallAndBand.get(dedupeKey);
      if (!existing) {
        byCallAndBand.set(dedupeKey, spot);
        return;
      }

      const existingTime = this.parseSpotTime(existing.spotTime)?.getTime() || 0;
      const nextTime = this.parseSpotTime(spot.spotTime)?.getTime() || 0;
      if (nextTime >= existingTime) {
        byCallAndBand.set(dedupeKey, spot);
      }
    });

    return Array.from(byCallAndBand.values());
  }

  async loadLoggedQsos() {
    if (!window.electron || typeof window.electron.getQsos !== 'function') {
      this.loggedQsos = [];
      this.workedQsoKeys = new Set();
      this.workedQsoDigiKeys = new Set();
      return;
    }

    try {
      const qsos = await window.electron.getQsos();
      this.loggedQsos = Array.isArray(qsos) ? qsos : [];
      this.workedQsoKeys = new Set(
        this.loggedQsos.map((qso) => this.getQsoMatchKey(qso)).filter(Boolean),
      );
      this.workedQsoDigiKeys = new Set(
        this.loggedQsos.map((qso) => this.getQsoDigiEquivalentMatchKey(qso)).filter(Boolean),
      );
    } catch (error) {
      console.error('Error loading logged QSOs:', error);
      this.loggedQsos = [];
      this.workedQsoKeys = new Set();
      this.workedQsoDigiKeys = new Set();
    }
  }

  updateFilterOptions() {
    const modes = new Set();
    const bands = new Set();

    this.spots.forEach((spot) => {
      if (spot.mode) {
        modes.add(spot.mode);
      }
      const freqMHz = this.parseFrequencyMHz(spot.frequency);
      if (Number.isFinite(freqMHz)) {
        const band = this.frequencyToBand(freqMHz);
        if (band) {
          bands.add(band);
        }
      }
    });

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

  parseFrequencyMHz(frequencyKHz) {
    const freq = parseFloat(frequencyKHz);
    if (!Number.isFinite(freq)) {
      return Number.NaN;
    }

    return freq / 1000;
  }

  frequencyToBand(freqMHz) {
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

  async selectSpot(spot) {
    if (!window.electron || typeof window.electron.selectDxSummitSpot !== 'function') {
      return;
    }

    try {
      const decodeSighting = this.getSpotDecodeSighting(spot);
      const response = await window.electron.selectDxSummitSpot({
        spot: spot || {},
        decodePacket: decodeSighting?.decodePacket || null,
      });
      if (response && response.success === false) {
        console.error('Failed to activate DX Summit spot:', response.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to send selected DX Summit spot:', error);
    }
  }

  async loadFilterState() {
    try {
      if (window.electron && typeof window.electron.getDxSummitSpotsFilters === 'function') {
        const state = await window.electron.getDxSummitSpotsFilters();
        this.persistedFilters = {
          modeFilter: String(state?.modeFilter || ''),
          bandFilter: String(state?.bandFilter || ''),
          regionFilter: String(state?.regionFilter || '').toUpperCase(),
          callFilter: String(state?.callFilter || ''),
          hideWorked: Boolean(state?.hideWorked),
          hideQrt: Boolean(state?.hideQrt),
        };
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
    }
  }

  saveFilterState() {
    const state = {
      modeFilter: document.getElementById('modeFilter').value,
      bandFilter: document.getElementById('bandFilter').value,
      regionFilter: String(document.getElementById('regionFilter').value || '').toUpperCase(),
      callFilter: String(document.getElementById('callFilter').value || ''),
      hideWorked: document.getElementById('hideWorkedFilter').checked,
      hideQrt: document.getElementById('hideQrtFilter').checked,
    };
    this.persistedFilters = { ...state };
    if (window.electron && typeof window.electron.saveDxSummitSpotsFilters === 'function') {
      window.electron.saveDxSummitSpotsFilters(state).catch((error) => {
        console.error('Error saving filter state:', error);
      });
    }
  }

  applyPersistedFilters() {
    const regionInput = document.getElementById('regionFilter');
    if (regionInput) {
      regionInput.value = this.persistedFilters.regionFilter || '';
    }

    const callInput = document.getElementById('callFilter');
    if (callInput) {
      callInput.value = this.persistedFilters.callFilter || '';
    }

    const hideWorkedInput = document.getElementById('hideWorkedFilter');
    if (hideWorkedInput) {
      hideWorkedInput.checked = Boolean(this.persistedFilters.hideWorked);
    }

    const hideQrtInput = document.getElementById('hideQrtFilter');
    if (hideQrtInput) {
      hideQrtInput.checked = Boolean(this.persistedFilters.hideQrt);
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

  normalizeDecodeCallsignToken(token) {
    return String(token || '')
      .trim()
      .toUpperCase()
      .replace(/^[^A-Z0-9/]+|[^A-Z0-9/]+$/g, '');
  }

  isLikelyDecodeCallsign(token) {
    if (!token) {
      return false;
    }

    if (/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(token)) {
      return false;
    }

    if (!/^[A-Z0-9]{1,8}(?:\/[A-Z0-9]{1,8}){0,2}$/.test(token)) {
      return false;
    }

    return /[A-Z]/.test(token) && /[0-9]/.test(token);
  }

  doesDecodeMessageContainCallsign(message, callsign) {
    const normalizedMessage = String(message || '')
      .trim()
      .toUpperCase();
    const normalizedCallsign = String(callsign || '')
      .trim()
      .toUpperCase();
    const messageForStartCheck = normalizedMessage.replace(/^[^A-Z0-9/]+/, '');

    if (!normalizedMessage || !normalizedCallsign) {
      return false;
    }

    if (messageForStartCheck.startsWith(normalizedCallsign)) {
      return false;
    }

    const escapedCallsign = normalizedCallsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callsignPattern = new RegExp(`(^|[^A-Z0-9/])${escapedCallsign}($|[^A-Z0-9/])`);
    return callsignPattern.test(normalizedMessage);
  }

  recordDecodePacket(packet) {
    const message = String(packet?.message || '');
    if (!message) {
      return;
    }

    const seenAt = Date.now();
    const snrValue = Number(packet?.snr);
    let didUpdateSighting = false;

    const buildDecodePacket = () => ({
      time: Number(packet?.time),
      snr: Number.isFinite(snrValue) ? snrValue : null,
      deltaTime: Number(packet?.deltaTime),
      deltaFreq: Number(packet?.deltaFreq),
      mode: String(packet?.mode || ''),
      rawMode: String(packet?.rawMode || ''),
      message,
      wsjtxId: String(packet?.wsjtxId || ''),
      sourceHost: String(packet?.sourceHost || ''),
      sourcePort: Number(packet?.sourcePort),
      lowConfidence: Boolean(packet?.lowConfidence),
      modifiers: Number(packet?.modifiers) || 0,
    });

    this.spots.forEach((spot) => {
      const callsign = String(spot?.dxCall || '')
        .trim()
        .toUpperCase();
      if (!this.doesDecodeMessageContainCallsign(message, callsign)) {
        return;
      }

      this.decodeSightingsByCallsign.set(callsign, {
        snr: Number.isFinite(snrValue) ? snrValue : null,
        seenAt,
        decodePacket: buildDecodePacket(),
      });
      didUpdateSighting = true;
    });

    if (didUpdateSighting) {
      this.pruneExpiredDecodeSightings();
      this.applyFilters();
    }
  }

  handleClearPacket() {
    if (this.decodeSightingsByCallsign.size === 0) {
      return;
    }

    this.decodeSightingsByCallsign.clear();
    this.applyFilters();
  }

  getSpotCallsign(spot) {
    return String(spot?.dxCall || '')
      .trim()
      .toUpperCase();
  }

  getSpotDecodeSighting(spot) {
    const callsign = this.getSpotCallsign(spot);
    if (!callsign) {
      return null;
    }

    const sighting = this.decodeSightingsByCallsign.get(callsign) || null;
    if (!sighting) {
      return null;
    }

    if (this.isDecodeSightingExpired(sighting)) {
      this.decodeSightingsByCallsign.delete(callsign);
      return null;
    }

    return sighting;
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

  isPhoneOrCwMode(modeValue) {
    const mode = String(modeValue || '')
      .trim()
      .toUpperCase();
    return mode === 'SSB' || mode === 'CW';
  }

  getIsoDatePart(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return '';
    }

    if (/^\d{8}$/.test(rawValue)) {
      return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue.slice(0, 10);
    }

    const parsedDate = this.parseSpotTime(rawValue) || new Date(rawValue);
    return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
  }

  getQsoMatchKey(qso) {
    if (!qso) {
      return '';
    }

    const fieldSet = new Set(this.workedMatchFields);
    const parts = [];

    if (fieldSet.has('call')) {
      const call = String(qso.call || qso.dxCall || '')
        .trim()
        .toUpperCase();
      if (!call) {
        return '';
      }
      parts.push(call);
    }

    if (fieldSet.has('band')) {
      const band = String(qso.band || '')
        .trim()
        .toUpperCase();
      if (!band) {
        return '';
      }
      parts.push(band);
    }

    if (fieldSet.has('mode')) {
      const mode = this.getModeMatchKey(qso.mode, qso.submode);
      if (!mode) {
        return '';
      }
      parts.push(mode);
    }

    if (fieldSet.has('date')) {
      const date =
        this.getIsoDatePart(qso.start || qso.end) ||
        this.getIsoDatePart(qso.qso_date || qso.date_on || qso.qso_date_off || qso.date_off);
      if (!date) {
        return '';
      }
      parts.push(date);
    }

    return parts.length > 0 ? parts.join('|') : '';
  }

  getQsoDigiEquivalentMatchKey(qso) {
    if (!qso) {
      return '';
    }

    const fieldSet = new Set(this.workedMatchFields);
    if (!fieldSet.has('mode')) {
      return '';
    }

    const mode = this.getModeMatchKey(qso.mode, qso.submode);
    if (!mode || this.isPhoneOrCwMode(mode)) {
      return '';
    }

    const parts = [];

    if (fieldSet.has('call')) {
      const call = String(qso.call || qso.dxCall || '')
        .trim()
        .toUpperCase();
      if (!call) {
        return '';
      }
      parts.push(call);
    }

    if (fieldSet.has('band')) {
      const band = String(qso.band || '')
        .trim()
        .toUpperCase();
      if (!band) {
        return '';
      }
      parts.push(band);
    }

    parts.push('DIGI');

    if (fieldSet.has('date')) {
      const date =
        this.getIsoDatePart(qso.start || qso.end) ||
        this.getIsoDatePart(qso.qso_date || qso.date_on || qso.qso_date_off || qso.date_off);
      if (!date) {
        return '';
      }
      parts.push(date);
    }

    return parts.length > 0 ? parts.join('|') : '';
  }

  getSpotMatchKey(spot) {
    if (!spot) {
      return '';
    }

    const fieldSet = new Set(this.workedMatchFields);
    const parts = [];

    if (fieldSet.has('call')) {
      const call = this.getSpotCallsign(spot);
      if (!call) {
        return '';
      }
      parts.push(call);
    }

    if (fieldSet.has('band')) {
      const freqMHz = this.parseFrequencyMHz(spot.frequency);
      const band = String(this.frequencyToBand(freqMHz) || '')
        .trim()
        .toUpperCase();
      if (!band) {
        return '';
      }
      parts.push(band);
    }

    if (fieldSet.has('mode')) {
      const mode = this.getModeMatchKey(spot.mode, '');
      if (!mode) {
        return '';
      }
      parts.push(mode);
    }

    if (fieldSet.has('date')) {
      const date = this.getIsoDatePart(spot.spotTime);
      if (!date) {
        return '';
      }
      parts.push(date);
    }

    return parts.length > 0 ? parts.join('|') : '';
  }

  isWorkedSpot(spot) {
    const spotKey = this.getSpotMatchKey(spot);
    if (Boolean(spotKey) && this.workedQsoKeys.has(spotKey)) {
      return true;
    }

    const fieldSet = new Set(this.workedMatchFields);
    if (!fieldSet.has('mode')) {
      return false;
    }

    const spotMode = this.getModeMatchKey(spot?.mode, '');
    if (spotMode !== 'DIGI') {
      return false;
    }

    return Boolean(spotKey) && this.workedQsoDigiKeys.has(spotKey);
  }

  doesSpotCountryMatchFilter(location, regionFilter) {
    const normalizedFilter = String(regionFilter || '')
      .trim()
      .toUpperCase();

    if (!normalizedFilter) {
      return true;
    }

    const country = String(location || '')
      .trim()
      .toUpperCase();

    return country.includes(normalizedFilter);
  }

  buildCallFilterMatcher(rawFilter) {
    const normalized = String(rawFilter || '').trim();
    if (!normalized) {
      return () => true;
    }

    const regexMatch = normalized.match(/^\/(.*)\/([a-z]*)$/i);
    if (regexMatch) {
      try {
        const pattern = regexMatch[1];
        const flags = regexMatch[2] || 'i';
        const re = new RegExp(pattern, flags);
        return (value) => re.test(value);
      } catch {
        // Fall through to simple text search.
      }
    }

    const needle = normalized.toUpperCase();
    return (value) =>
      String(value || '')
        .toUpperCase()
        .includes(needle);
  }

  applyFilters() {
    const modeFilter = document.getElementById('modeFilter').value.toUpperCase();
    const bandFilter = document.getElementById('bandFilter').value;
    const regionFilter = document.getElementById('regionFilter').value.toUpperCase();
    const callFilter = document.getElementById('callFilter').value;
    const hideWorked = document.getElementById('hideWorkedFilter').checked;
    const hideQrt = document.getElementById('hideQrtFilter').checked;
    const callMatcher = this.buildCallFilterMatcher(callFilter);

    this.filteredSpots = this.spots.filter((spot) => {
      if (hideWorked && this.isWorkedSpot(spot)) {
        return false;
      }

      if (hideQrt && this.hasQrtStatus(spot)) {
        return false;
      }

      const spotMode = String(spot.mode || '').toUpperCase();
      if (modeFilter && spotMode !== modeFilter) {
        return false;
      }

      if (bandFilter) {
        const freqMHz = this.parseFrequencyMHz(spot.frequency);
        const band = this.frequencyToBand(freqMHz);
        if (band !== bandFilter) {
          return false;
        }
      }

      if (regionFilter && !this.doesSpotCountryMatchFilter(spot.location, regionFilter)) {
        return false;
      }

      if (!callMatcher(String(spot.dxCall || ''))) {
        return false;
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

      if (this.sortField === 'frequency') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }

      if (this.sortField === 'offset') {
        aVal = this.getSpotOffsetHz(a) || 0;
        bVal = this.getSpotOffsetHz(b) || 0;
      }

      if (this.sortField === 'age') {
        aVal = this.getSpotAgeMinutes(this.getEffectiveSpotTime(a));
        bVal = this.getSpotAgeMinutes(this.getEffectiveSpotTime(b));
      }

      if (this.sortField === 'status') {
        const aStatus = this.getSpotStatusSortInfo(a);
        const bStatus = this.getSpotStatusSortInfo(b);

        if (aStatus.rank < bStatus.rank) {
          return this.sortDescending ? 1 : -1;
        }

        if (aStatus.rank > bStatus.rank) {
          return this.sortDescending ? -1 : 1;
        }

        if (aStatus.value < bStatus.value) {
          return this.sortDescending ? 1 : -1;
        }

        if (aStatus.value > bStatus.value) {
          return this.sortDescending ? -1 : 1;
        }

        if (aStatus.secondaryValue < bStatus.secondaryValue) {
          return this.sortDescending ? 1 : -1;
        }

        if (aStatus.secondaryValue > bStatus.secondaryValue) {
          return this.sortDescending ? -1 : 1;
        }

        return 0;
      }

      if (this.sortField === 'spotTime') {
        aVal = this.parseSpotTime(this.getEffectiveSpotTime(a))?.getTime() || 0;
        bVal = this.parseSpotTime(this.getEffectiveSpotTime(b))?.getTime() || 0;
      }

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

  shouldUseManualAction(spot) {
    const mode = String(spot?.mode || '')
      .trim()
      .toUpperCase();
    return mode === 'SSB' || mode === 'CW';
  }

  isDigiSpot(spot) {
    return (
      String(spot?.mode || '')
        .trim()
        .toUpperCase() === 'DIGI'
    );
  }

  hasQrtStatus(spot) {
    const comments = String(spot?.comments || '').trim();
    return /\bQRT\b/i.test(comments);
  }

  getCwRbnMetrics(spot) {
    const mode = String(spot?.mode || '')
      .trim()
      .toUpperCase();
    if (mode !== 'CW') {
      return null;
    }

    const comments = String(spot?.comments || '').trim();
    const match = comments.match(/^RBN\s+(\d+)\s+db\s+(\d+)\s+WPM/i);
    if (!match) {
      return null;
    }

    const db = Number(match[1]);
    const wpm = Number(match[2]);
    if (!Number.isFinite(db) || !Number.isFinite(wpm)) {
      return null;
    }

    return { db, wpm };
  }

  getCwRbnStatus(spot) {
    const metrics = this.getCwRbnMetrics(spot);
    if (!metrics) {
      return '';
    }

    return `${metrics.wpm} WPM @ ${metrics.db} db`;
  }

  getSpotStatusSortInfo(spot) {
    const decodeSighting = this.getSpotDecodeSighting(spot);
    const decodeSnr = Number(decodeSighting?.snr);
    if (this.isDigiSpot(spot) && Number.isFinite(decodeSnr)) {
      return { rank: 4, value: decodeSnr, secondaryValue: 0 };
    }

    if (this.hasQrtStatus(spot)) {
      return { rank: 3, value: 0, secondaryValue: 0 };
    }

    const rbnMetrics = this.getCwRbnMetrics(spot);
    if (rbnMetrics) {
      return { rank: 2, value: rbnMetrics.wpm, secondaryValue: rbnMetrics.db };
    }

    if (this.isWorkedSpot(spot)) {
      return { rank: 1, value: 0, secondaryValue: 0 };
    }

    return { rank: 0, value: 0, secondaryValue: 0 };
  }

  formatDecodeSnr(snr) {
    const numericSNR = Number(snr);
    if (!Number.isFinite(numericSNR)) {
      return '—';
    }

    return numericSNR > 0 ? `+${numericSNR}` : `${numericSNR}`;
  }

  computeSpotTimeFromDecodeTime(timeMs) {
    const numericTime = Number(timeMs);
    if (!Number.isFinite(numericTime)) {
      return new Date().toISOString();
    }

    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const stamp = new Date(utcMidnight + Math.max(0, numericTime));
    return Number.isNaN(stamp.getTime()) ? new Date().toISOString() : stamp.toISOString();
  }

  getEffectiveSpotTime(spot, decodeSighting = null) {
    const sighting = decodeSighting || this.getSpotDecodeSighting(spot);
    const decodeTime = Number(sighting?.decodePacket?.time);
    if (Number.isFinite(decodeTime) && decodeTime >= 0) {
      return this.computeSpotTimeFromDecodeTime(decodeTime);
    }

    return spot?.spotTime;
  }

  getSpotOffsetHz(spot) {
    const sighting = this.getSpotDecodeSighting(spot);
    const offsetHz = Number(sighting?.decodePacket?.deltaFreq);
    return Number.isFinite(offsetHz) ? offsetHz : null;
  }

  formatOffset(offsetHz) {
    const numericOffset = Number(offsetHz);
    if (!Number.isFinite(numericOffset)) {
      return '—';
    }

    return `${Math.trunc(numericOffset)}`;
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

  formatSpotTime(timeStr) {
    try {
      const isoStr = String(timeStr || '').trim();
      const parts = isoStr.split('T');
      if (parts.length >= 2) {
        const datePart = parts[0];
        const timePart = parts[1];
        return `${datePart.substr(5, 5)} @ ${timePart.substr(0, 5)}`;
      }

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

  formatFrequency(freqKHz) {
    const freq = parseFloat(freqKHz);
    if (Number.isNaN(freq)) {
      return String(freqKHz || '');
    }

    return (freq / 1000).toFixed(4);
  }

  handleRelayStatusUpdate(statusData) {
    const nextDxCall = String(statusData?.dxcall || statusData?.dxCall || '')
      .trim()
      .toUpperCase();
    const nextTxEnabled = Boolean(statusData?.txEnabled);
    const nextTransmitting = Boolean(statusData?.transmitting);
    const nextStationCallsign = String(statusData?.deCall || statusData?.decall || '')
      .trim()
      .toUpperCase();

    const hasChanges =
      nextDxCall !== this.currentTxStatus.dxCall ||
      nextTxEnabled !== this.currentTxStatus.txEnabled ||
      nextTransmitting !== this.currentTxStatus.transmitting ||
      nextStationCallsign !== this.stationCallsign;

    if (!hasChanges) {
      return;
    }

    this.currentTxStatus = {
      dxCall: nextDxCall,
      txEnabled: nextTxEnabled,
      transmitting: nextTransmitting,
    };
    this.stationCallsign = nextStationCallsign;

    this.render();
  }

  isSelfSpot(spot) {
    if (!this.stationCallsign) {
      return false;
    }

    return this.getSpotCallsign(spot) === this.stationCallsign;
  }

  render() {
    this.pruneExpiredDecodeSightings();

    const tbody = document.getElementById('spotsTableBody');
    const noSpotsMsg = document.getElementById('noSpotsMessage');

    if (this.filteredSpots.length === 0) {
      tbody.innerHTML = '';
      noSpotsMsg.hidden = false;
      return;
    }

    noSpotsMsg.hidden = true;
    tbody.innerHTML = this.filteredSpots
      .map((spot, index) => {
        const row = document.createElement('tr');
        const isWorked = this.isWorkedSpot(spot);
        const decodeSighting = this.getSpotDecodeSighting(spot);
        const isSeenInDecode = this.isDigiSpot(spot) && Boolean(decodeSighting);
        const effectiveSpotTime = this.getEffectiveSpotTime(spot, decodeSighting);
        const offsetHz = Number(decodeSighting?.decodePacket?.deltaFreq);
        const useManualAction = this.shouldUseManualAction(spot);
        const hasQrtStatus = this.hasQrtStatus(spot);
        const hasReplySnr = Number.isFinite(Number(decodeSighting?.snr));
        const isSelfSpot = this.isSelfSpot(spot);
        const isRadioTransmitting = Boolean(this.currentTxStatus.transmitting);
        const manualQrtDisabled = useManualAction && hasQrtStatus;
        const replyDisabled =
          !useManualAction && (isWorked || !hasReplySnr || isRadioTransmitting);
        const actionDisabled = isSelfSpot || manualQrtDisabled || replyDisabled;
        const actionLabel = useManualAction ? 'Manual' : 'Reply';
        const actionDisabledAttr = actionDisabled ? ' disabled' : '';
        const actionTitle = isSelfSpot
          ? 'Actions disabled for your own callsign spot'
          : manualQrtDisabled
            ? 'Manual unavailable for QRT spots'
            : replyDisabled
              ? isRadioTransmitting
                ? 'Reply unavailable while transmitting'
                : isWorked
                  ? 'Reply unavailable for worked spots'
                  : 'Reply requires a decode with valid SNR'
              : '';
        const actionTitleAttr = actionTitle ? ` title="${this.escapeHtml(actionTitle)}"` : '';

        const workedBadge = isWorked ? '<span class="pota-worked-badge">Worked</span>' : '';
        const decodeBadge = isSeenInDecode
          ? `<span class="pota-decode-badge">SNR ${this.formatDecodeSnr(decodeSighting?.snr)}</span>`
          : '';
        const qrtBadge = this.hasQrtStatus(spot) ? '<span class="pota-qrt-badge">QRT</span>' : '';
        const cwRbnStatus = this.getCwRbnStatus(spot);
        const cwRbnBadge = cwRbnStatus
          ? `<span class="pota-rbn-badge">${this.escapeHtml(cwRbnStatus)}</span>`
          : '';

        const normalizedDxCall = String(spot.dxCall || '')
          .trim()
          .toUpperCase();
        const isTxTarget =
          Boolean(this.currentTxStatus.dxCall) && this.currentTxStatus.dxCall === normalizedDxCall;
        const isTxEnabledTarget = isTxTarget && this.currentTxStatus.txEnabled;
        const isTransmittingTarget = isTxEnabledTarget && this.currentTxStatus.transmitting;

        const rowClassNames = ['pota-spot-row'];
        if (isWorked) {
          rowClassNames.push('pota-spot-worked');
        }
        if (isSelfSpot) {
          rowClassNames.push('pota-spot-self');
        } else if (isTransmittingTarget) {
          rowClassNames.push('pota-spot-transmitting');
        } else if (isTxEnabledTarget) {
          rowClassNames.push('pota-spot-tx-enabled');
        }

        row.className = rowClassNames.join(' ');
        row.setAttribute('data-spot-index', String(index));
        row.title = isWorked ? 'Already worked today' : '';
        row.innerHTML = `
          <td><div class="pota-activator-cell"><span class="pota-activator-text">${this.escapeHtml(spot.dxCall || '')}</span></div></td>
          <td><div class="pota-status-cell">${workedBadge}${decodeBadge}${qrtBadge}${cwRbnBadge}</div></td>
          <td>${this.formatFrequency(spot.frequency)}</td>
          <td>${this.formatOffset(offsetHz)}</td>
          <td>${this.escapeHtml(spot.mode || '')}</td>
          <td>${this.escapeHtml(spot.comments || '')}</td>
          <td>${this.escapeHtml(spot.location || '')}</td>
          <td>${this.formatSpotTime(effectiveSpotTime)}</td>
          <td>${this.formatSpotAge(effectiveSpotTime)}</td>
          <td><button type="button" class="btn btn-secondary btn-sm pota-action-btn" data-spot-index="${index}"${actionDisabledAttr}${actionTitleAttr}>${actionLabel}</button></td>
        `;
        return row.outerHTML;
      })
      .join('');
  }

  updateLastUpdateDisplay() {
    if (this.lastUpdateTime) {
      const timeStr = this.lastUpdateTime.toLocaleTimeString();
      document.title = `DX Summit Spots — updated ${timeStr}`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dxSummitSpotsManager = new DxSummitSpotsManager();
});
