function appendQueryParam(urlString, key, value) {
  const url = new URL(urlString);
  url.searchParams.set(key, value);
  return url.toString();
}

function normalizeDxSummitMode(value) {
  const mode = String(value || '')
    .trim()
    .toUpperCase();

  if (mode === 'PHONE') {
    return 'SSB';
  }

  return mode;
}

async function fetchDxSummitSpotsByInclude(
  fetchImpl,
  dxSummitSpotsUrl,
  includeMode,
  requestTimeoutMs,
) {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort(new Error(`timeout after ${requestTimeoutMs}ms`));
  }, requestTimeoutMs);

  try {
    const requestUrl = appendQueryParam(dxSummitSpotsUrl, 'include_modes', includeMode);
    const response = await fetchImpl(requestUrl, {
      signal: abortController.signal,
      headers: {
        accept: 'application/json',
      },
    });

    if (!response || !response.ok) {
      throw new Error(
        `DX Summit spots request failed for ${includeMode} with status ${response?.status}`,
      );
    }

    const parsed = await response.json();
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.spots)
        ? parsed.spots
        : Array.isArray(parsed?.results)
          ? parsed.results
          : [];

    return records;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeRequestedIncludeModes(modeFilters) {
  const modeToInclude = {
    CW: 'CW',
    SSB: 'PHONE',
    DIGI: 'DIGI',
  };

  if (modeFilters === undefined || modeFilters === null) {
    return ['DIGI', 'PHONE', 'CW'];
  }

  const requestedModes = Array.isArray(modeFilters)
    ? modeFilters
        .map((value) =>
          String(value || '')
            .trim()
            .toUpperCase(),
        )
        .filter((value) => value in modeToInclude)
    : [];

  return Array.from(new Set(requestedModes.map((value) => modeToInclude[value])));
}

async function fetchDxSummitSpots(fetchImpl, dxSummitSpotsUrl, requestTimeoutMs, modeFilters) {
  const includeModes = normalizeRequestedIncludeModes(modeFilters);
  if (includeModes.length === 0) {
    return [];
  }
  const responses = await Promise.all(
    includeModes.map((includeMode) =>
      fetchDxSummitSpotsByInclude(fetchImpl, dxSummitSpotsUrl, includeMode, requestTimeoutMs),
    ),
  );

  const byStableId = new Map();

  responses.forEach((records, index) => {
    const includeMode = includeModes[index];

    records.forEach((record) => {
      const stableId = String(record?.id || '').trim();
      const callsign = String(record?.dx_call || '')
        .trim()
        .toUpperCase();
      const frequency = String(record?.frequency || record?.frequency_khz || '').trim();
      const time = String(record?.time || '').trim();
      const key = stableId || `${callsign}|${frequency}|${time}`;

      if (!key) {
        return;
      }

      const existing = byStableId.get(key);
      if (!existing) {
        byStableId.set(key, {
          record,
          includeModes: new Set([includeMode]),
        });
        return;
      }

      existing.includeModes.add(includeMode);
    });
  });

  return Array.from(byStableId.values()).map(({ record, includeModes: matchedIncludes }) => {
    const includeList = Array.from(matchedIncludes);
    if (includeList.length === 1) {
      return {
        ...record,
        mode: normalizeDxSummitMode(includeList[0]),
      };
    }

    return { ...record };
  });
}

function shouldPopulateManualQsoForDxSpot(spot) {
  const mode = String(spot?.mode || '')
    .trim()
    .toUpperCase();
  return mode === 'SSB' || mode === 'CW';
}

module.exports = {
  fetchDxSummitSpots,
  shouldPopulateManualQsoForDxSpot,
};
