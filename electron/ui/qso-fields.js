(function () {
  const qsoFields = {
    call: { label: 'DX Call', type: 'string' },
    freq: { label: 'Frequency (Mhz)', type: 'number' },
    band: {
      label: 'Band',
      type: 'enum',
      readOnly: true,
      calculated: true,
      values: [
        '160M',
        '80M',
        '60M',
        '40M',
        '30M',
        '20M',
        '17M',
        '15M',
        '12M',
        '10M',
        '6M',
        '2M',
        '70CM',
        '23CM',
      ],
    },
    gridsquare: {
      label: 'Gridsquare',
      type: 'string',
      pattern: '^[A-Z]{2}[0-9]{2}(?:[A-Z]{2})?$',
    },
    my_gridsquare: {
      label: 'My Grid',
      type: 'string',
      pattern: '^[A-Z]{2}[0-9]{2}(?:[A-Z]{2})?$',
    },
    mode: { label: 'Mode', type: 'enum', values: ['CW', 'SSB', 'FT8', 'MFSK'] },
    submode: { label: 'Submode', type: 'enum', values: ['', 'FT2', 'FT4', 'FT8'] },
    rst_sent: { label: 'RST Sent', type: 'string' },
    rst_rcvd: { label: 'RST Rcvd', type: 'string' },
    station_callsign: { label: 'DE Call', type: 'string' },
    my_state: { label: 'My State', type: 'string' },
    operator: { label: 'Operator', type: 'string' },
    state: { label: 'State', type: 'string' },
    tx_pwr: { label: 'TX Pwr (w)', type: 'number' },
    start: { label: 'Start', type: 'string' },
    end: { label: 'End', type: 'string' },
    my_sig: { label: 'My Sig', type: 'enum', values: ['', 'POTA'], hidden: true },
    my_sig_info: { label: 'My Park', type: 'string', pattern: '^[A-Z]{2}-[0-9]{4}[0-9]?$' },
    sig: { label: 'Sig', type: 'enum', values: ['', 'POTA'], hidden: true },
    sig_info: { label: 'Their Park', type: 'string', pattern: '^[A-Z]{2}-[0-9]{4}[0-9]?$' },
    comment: { label: 'Comment', type: 'string' },
  };

  function freqToBand(freq) {
    const value = Number(freq);
    if (!Number.isFinite(value)) {
      return 'OOB';
    }

    switch (true) {
      case value >= 50.0 && value <= 54.0:
        return '6M';
      case value >= 28.0 && value <= 29.7:
        return '10M';
      case value >= 24.89 && value <= 24.99:
        return '12M';
      case value >= 21.0 && value <= 21.45:
        return '15M';
      case value >= 18.068 && value <= 18.168:
        return '17M';
      case value >= 14.0 && value <= 14.35:
        return '20M';
      case value >= 10.1 && value <= 10.15:
        return '30M';
      case value >= 7.0 && value <= 7.3:
        return '40M';
      case value >= 5.3 && value <= 5.5:
        return '60M';
      case value >= 3.5 && value <= 4.0:
        return '80M';
      case value >= 1.8 && value <= 2.0:
        return '160M';
      default:
        return 'OOB';
    }
  }

  function normalizeCalculatedFields(qso) {
    if (!qso.submode && qso.subMode) {
      qso.submode = qso.subMode;
    }
    delete qso.subMode;
    qso.submode = String(qso.submode || '')
      .toUpperCase()
      .trim();

    qso.call = String(qso.call || '')
      .toUpperCase()
      .trim();
    qso.gridsquare = String(qso.gridsquare || '')
      .toUpperCase()
      .trim();
    qso.my_gridsquare = String(qso.my_gridsquare || '')
      .toUpperCase()
      .trim();
    qso.station_callsign = String(qso.station_callsign || '')
      .toUpperCase()
      .trim();
    qso.my_state = String(qso.my_state || '')
      .toUpperCase()
      .trim();
    qso.state = String(qso.state || '')
      .toUpperCase()
      .trim();
    qso.my_sig_info = normalizeParkRef(qso.my_sig_info);
    qso.sig_info = normalizeParkRef(qso.sig_info);

    qso.band = freqToBand(qso.freq);

    const sigInfo = String(qso.sig_info || '').trim();
    qso.sig = sigInfo ? 'POTA' : '';

    const mySigInfo = String(qso.my_sig_info || '').trim();
    qso.my_sig = mySigInfo ? 'POTA' : '';
  }

  function normalizeParkRef(value) {
    const upper = String(value || '')
      .trim()
      .toUpperCase();
    if (/^[0-9]{4,5}$/.test(upper)) {
      return `US-${upper}`;
    }
    return upper;
  }

  window.wsjtxQsoFields = qsoFields;
  window.wsjtxFreqToBand = freqToBand;
  window.wsjtxNormalizeCalculatedFields = normalizeCalculatedFields;
})();
