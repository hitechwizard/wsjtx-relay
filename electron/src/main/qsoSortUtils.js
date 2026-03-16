function getQsoTimestampMs(qso) {
  if (!qso || typeof qso !== 'object') {
    return 0;
  }

  const candidates = [
    qso.start,
    qso.end,
    qso.qso_date,
    qso.date_on,
    qso.qso_date_off,
    qso.date_off,
  ];

  for (const candidate of candidates) {
    const rawValue = String(candidate || '').trim();
    if (!rawValue) {
      continue;
    }

    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return 0;
}

function sortQsosForStorage(qsos) {
  const nextQsos = Array.isArray(qsos) ? [...qsos] : [];

  nextQsos.sort((a, b) => {
    const aTime = getQsoTimestampMs(a);
    const bTime = getQsoTimestampMs(b);

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    const aCall = String(a?.call || '').toUpperCase();
    const bCall = String(b?.call || '').toUpperCase();
    return aCall.localeCompare(bCall);
  });

  return nextQsos;
}

module.exports = {
  getQsoTimestampMs,
  sortQsosForStorage,
};
