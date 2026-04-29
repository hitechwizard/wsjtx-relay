function getLoggingFieldKey(appId, key) {
  const appKey = String(appId || '').trim().toLowerCase();
  if (!appKey) {
    return null;
  }

  if (appKey === 'qrz') {
    return `app_qrzlog_${key}`;
  }

  if (appKey === 'clublog') {
    return `app_clublog_${key}`;
  }

  return null;
}

function hasLoggingSubmissionSuccess(qso, appId) {
  if (!qso || typeof qso !== 'object') {
    return false;
  }

  const successKey = getLoggingFieldKey(appId, 'success');
  if (!successKey) {
    return false;
  }

  return qso[successKey] === true;
}

function markLoggingSubmissionSuccess(qso, appId, details = {}) {
  const successKey = getLoggingFieldKey(appId, 'success');
  const submittedAtKey = getLoggingFieldKey(appId, 'submitted_at');
  const errorMessageKey = getLoggingFieldKey(appId, 'error_message');
  const logIdKey = getLoggingFieldKey(appId, 'log_id');
  if (!successKey || !submittedAtKey || !errorMessageKey || !logIdKey) {
    return qso;
  }

  const nextQso = { ...(qso || {}) };
  nextQso[successKey] = true;
  nextQso[submittedAtKey] = new Date().toISOString();
  nextQso[errorMessageKey] = '';
  if (Object.prototype.hasOwnProperty.call(details, 'logId')) {
    nextQso[logIdKey] = String(details.logId || '').trim();
  }

  return nextQso;
}

function markLoggingSubmissionFailure(qso, appId, errorMessage) {
  const successKey = getLoggingFieldKey(appId, 'success');
  const submittedAtKey = getLoggingFieldKey(appId, 'submitted_at');
  const errorMessageKey = getLoggingFieldKey(appId, 'error_message');
  if (!successKey || !submittedAtKey || !errorMessageKey) {
    return qso;
  }

  const nextQso = { ...(qso || {}) };
  nextQso[successKey] = false;
  nextQso[submittedAtKey] = new Date().toISOString();
  nextQso[errorMessageKey] = String(errorMessage || '').trim();

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
