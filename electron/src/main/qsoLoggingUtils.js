function hasLoggingSubmissionSuccess(qso, appId) {
  if (!qso || typeof qso !== 'object') {
    return false;
  }

  const appKey = String(appId || '').trim();
  if (!appKey) {
    return false;
  }

  return Boolean(
    qso.logSubmissions &&
      typeof qso.logSubmissions === 'object' &&
      qso.logSubmissions[appKey] &&
      qso.logSubmissions[appKey].success === true,
  );
}

function markLoggingSubmissionSuccess(qso, appId, details = {}) {
  const appKey = String(appId || '').trim();
  if (!appKey) {
    return qso;
  }

  const nextQso = { ...(qso || {}) };
  const currentSubmissions =
    nextQso.logSubmissions && typeof nextQso.logSubmissions === 'object'
      ? nextQso.logSubmissions
      : {};

  nextQso.logSubmissions = {
    ...currentSubmissions,
    [appKey]: {
      ...(currentSubmissions[appKey] || {}),
      ...details,
      success: true,
      submittedAt: new Date().toISOString(),
    },
  };

  return nextQso;
}

function markLoggingSubmissionFailure(qso, appId, errorMessage) {
  const appKey = String(appId || '').trim();
  if (!appKey) {
    return qso;
  }

  const nextQso = { ...(qso || {}) };
  const currentSubmissions =
    nextQso.logSubmissions && typeof nextQso.logSubmissions === 'object'
      ? nextQso.logSubmissions
      : {};

  nextQso.logSubmissions = {
    ...currentSubmissions,
    [appKey]: {
      ...(currentSubmissions[appKey] || {}),
      errorMessage: errorMessage,
      success: false,
      submittedAt: new Date().toISOString(),
    },
  };

  return nextQso;
}

/**
 * Returns a shallow copy of the QSO with State and POTA park appended to the
 * comment field, matching the format used by manual QSO entry.  Fields already
 * present in the comment are not duplicated.
 */
function enrichQsoComment(qso) {
  if (!qso || typeof qso !== 'object') {
    return qso;
  }

  const state = String(qso.state || '').trim().toUpperCase();
  const isPotaEnriched = String(qso.sig || '').trim().toUpperCase() === 'POTA';
  const sigInfo = isPotaEnriched ? String(qso.sig_info || '').trim().toUpperCase() : '';

  if (!state && !sigInfo) {
    return qso;
  }

  const existingComment = String(qso.comment || '').trim();
  const parts = [];

  if (state && !existingComment.includes(`State: ${state}`)) {
    parts.push(`State: ${state}`);
  }

  if (sigInfo && !existingComment.includes(`POTA: ${sigInfo}`)) {
    parts.push(`POTA: ${sigInfo}`);
  }

  if (parts.length === 0) {
    return qso;
  }

  const detailComment = parts.join(' | ');
  const newComment = existingComment ? `${existingComment} | ${detailComment}` : detailComment;
  return { ...qso, comment: newComment };
}

module.exports = {
  hasLoggingSubmissionSuccess,
  markLoggingSubmissionSuccess,
  markLoggingSubmissionFailure,
  enrichQsoComment,
};
