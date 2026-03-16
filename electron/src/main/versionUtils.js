function parseVersionSegments(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => {
      const [numericPart] = String(segment).split('-');
      const parsed = Number.parseInt(numericPart, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function isVersionNewer(candidateVersion, currentVersion) {
  const candidate = parseVersionSegments(candidateVersion);
  const current = parseVersionSegments(currentVersion);
  const maxLength = Math.max(candidate.length, current.length);

  for (let index = 0; index < maxLength; index += 1) {
    const candidateSegment = candidate[index] || 0;
    const currentSegment = current[index] || 0;

    if (candidateSegment > currentSegment) {
      return true;
    }

    if (candidateSegment < currentSegment) {
      return false;
    }
  }

  return false;
}

module.exports = {
  parseVersionSegments,
  isVersionNewer,
};
