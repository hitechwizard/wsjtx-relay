function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toClampedInteger(value, minValue, maxValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < minValue || parsed > maxValue) {
    return null;
  }

  return parsed;
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function sanitizeForwards(rawForwards) {
  if (!Array.isArray(rawForwards)) {
    return null;
  }

  const sanitized = [];
  for (const forward of rawForwards) {
    if (!isPlainObject(forward)) {
      return null;
    }

    const host = String(forward.host || '').trim();
    const port = toClampedInteger(forward.port, 1, 65535);
    if (!host || port === null) {
      return null;
    }

    sanitized.push({
      host,
      port,
      disabled: Boolean(forward.disabled),
      description: String(forward.description || '').trim(),
    });
  }

  return sanitized;
}

function sanitizeQsoArray(rawQsos) {
  if (!Array.isArray(rawQsos)) {
    return null;
  }

  if (rawQsos.some((qso) => !isPlainObject(qso))) {
    return null;
  }

  return rawQsos;
}

module.exports = {
  isPlainObject,
  toClampedInteger,
  toNonNegativeNumber,
  sanitizeForwards,
  sanitizeQsoArray,
};
