function fetchPotaSpots(httpsModule, potaSpotsUrl, requestTimeoutMs) {
  return new Promise((resolve, reject) => {
    const request = httpsModule.get(potaSpotsUrl, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) {
            reject(new Error(`POTA spots request failed with status ${response.statusCode}`));
            return;
          }

          const payload = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(payload);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`timeout after ${requestTimeoutMs}ms`));
    });

    request.on('error', reject);
  });
}

function enrichQsoWithPotaSpot(qso, spots) {
  const nextQso = { ...(qso || {}) };
  const dxCall = String(nextQso.dx_call || nextQso.dxCall || nextQso.call || '')
    .toUpperCase()
    .trim();

  if (!dxCall || !Array.isArray(spots) || spots.length === 0) {
    return nextQso;
  }

  const spotMatch = spots.find(
    (spot) =>
      String(spot?.activator || '')
        .toUpperCase()
        .trim() === dxCall,
  );
  if (!spotMatch) {
    return nextQso;
  }

  const existingGrid = String(nextQso.dxGrid || nextQso.gridsquare || '').trim();
  const spotGrid = String(spotMatch.grid4 || '')
    .toUpperCase()
    .trim();
  if (!existingGrid && spotGrid) {
    nextQso.gridsquare = spotGrid;
  }

  nextQso.sig_info = String(spotMatch.reference || '')
    .toUpperCase()
    .trim();
  nextQso.sig = 'POTA';
  return nextQso;
}

function shouldPopulateManualQsoForSpot(spot) {
  const mode = String(spot?.mode || '')
    .trim()
    .toUpperCase();
  return mode === 'SSB' || mode === 'CW';
}

module.exports = {
  fetchPotaSpots,
  enrichQsoWithPotaSpot,
  shouldPopulateManualQsoForSpot,
};
