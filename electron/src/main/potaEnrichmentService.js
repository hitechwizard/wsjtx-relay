async function maybeEnrichQsoFromPotaSpotMap({
  qso,
  usePotaSpotMap,
  fetchPotaSpots,
  enrichQsoWithPotaSpot,
  onPotaRequestFailure,
}) {
  if (!usePotaSpotMap) {
    return qso;
  }

  try {
    const spots = await fetchPotaSpots();
    return enrichQsoWithPotaSpot(qso, spots);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (typeof onPotaRequestFailure === 'function') {
      onPotaRequestFailure(message);
    }
    return qso;
  }
}

module.exports = {
  maybeEnrichQsoFromPotaSpotMap,
};
