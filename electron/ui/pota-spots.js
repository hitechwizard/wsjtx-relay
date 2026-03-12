// POTA Spots window management
class PotaSpotsManager {
  constructor() {
    this.spots = [];
    this.filteredSpots = [];
    this.sortField = 'spotTime';
    this.sortDescending = true;
    this.lastUpdateTime = null;
    this.minUpdateIntervalMs = 60 * 1000; // 1 minute
    this.lastFetchTime = 0;
    this.autoRefreshTimer = null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupThemeListener();
    this.loadFilterState();
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

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => this.fetchSpots());

    // Column headers for sorting
    document.querySelectorAll('.pota-spots-table thead th').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e) => {
        const field = e.target.getAttribute('data-field');
        this.sortByField(field);
      });
    });
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

  saveFilterState() {
    const state = {
      modeFilter: document.getElementById('modeFilter').value,
      bandFilter: document.getElementById('bandFilter').value,
      regionFilter: document.getElementById('regionFilter').value,
    };
    localStorage.setItem('potaSpotsFilters', JSON.stringify(state));
  }

  loadFilterState() {
    try {
      const saved = localStorage.getItem('potaSpotsFilters');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.modeFilter) {
          document.getElementById('modeFilter').value = state.modeFilter;
        }
        if (state.bandFilter) {
          document.getElementById('bandFilter').value = state.bandFilter;
        }
        if (state.regionFilter) {
          document.getElementById('regionFilter').value = state.regionFilter;
        }
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
    }
  }

  async fetchSpots() {
    const now = Date.now();
    if (now - this.lastFetchTime < this.minUpdateIntervalMs && this.spots.length > 0) {
      console.log('Skipping fetch - updated less than 1 minute ago');
      return;
    }

    try {
      document.getElementById('refreshBtn').disabled = true;
      const response = await window.electron.fetchPotaSpots();
      
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
    } finally {
      document.getElementById('refreshBtn').disabled = false;
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

  applyFilters() {
    const modeFilter = document.getElementById('modeFilter').value.toUpperCase();
    const bandFilter = document.getElementById('bandFilter').value;
    const regionFilter = document.getElementById('regionFilter').value.toUpperCase();

    this.filteredSpots = this.spots.filter((spot) => {
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

      // Handle datetime
      if (this.sortField === 'spotTime') {
        aVal = new Date(aVal).getTime() || 0;
        bVal = new Date(bVal).getTime() || 0;
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
      .map((spot) => {
        const row = document.createElement('tr');
        row.className = 'pota-spot-row';
        row.innerHTML = `
          <td>${this.escapeHtml(spot.activator || '')}</td>
          <td>${this.formatFrequency(spot.frequency)}</td>
          <td>${this.escapeHtml(spot.mode || '')}</td>
          <td>${this.escapeHtml(spot.reference || '')}</td>
          <td>${this.escapeHtml(spot.name || '')}</td>
          <td>${this.escapeHtml(spot.locationDesc || '')}</td>
          <td>${this.formatSpotTime(spot.spotTime)}</td>
        `;
        return row.outerHTML;
      })
      .join('');
  }

  updateLastUpdateDisplay() {
    const lastUpdateEl = document.getElementById('lastUpdateTime');
    if (this.lastUpdateTime) {
      const timeStr = this.lastUpdateTime.toLocaleTimeString();
      lastUpdateEl.textContent = `Last updated: ${timeStr}`;
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
