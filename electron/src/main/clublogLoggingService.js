const { AdiWriter } = require('../adif/AdiWriter');
const { enrichQsoComment } = require('./qsoLoggingUtils');

const CLUBLOG_API_URL = 'https://clublog.org/realtime.php';

function getPublishRuntimeConfig() {
  try {
    return require('./publishRuntimeConfig');
  } catch {
    return {};
  }
}

function buildSingleQsoAdif(qso) {
  const writer = new AdiWriter('wsjtx-relay', '1.0');
  return writer.writeFldigiLine(enrichQsoComment(qso) || {});
}

async function submitQsoToClublog({
  fetchImpl,
  callsign,
  password,
  email,
  qso,
  timeoutMs = 10000,
}) {
  if (typeof fetchImpl !== 'function') {
    return { success: false, error: 'Fetch is not available' };
  }

  const normalizedCallsign = String(callsign || '').trim();
  const normalizedPassword = String(password || '').trim();
  const normalizedEmail = String(email || '').trim();
  const normalizedApiKey = String(getPublishRuntimeConfig().clublogApiKey || '').trim();

  if (!normalizedCallsign || !normalizedPassword || !normalizedEmail) {
    return {
      success: false,
      error: 'Missing Clublog credentials (callsign, password, or email)',
    };
  }

  const adif = buildSingleQsoAdif(qso);
  const body = new URLSearchParams({
    email: normalizedEmail,
    password: normalizedPassword,
    callsign: normalizedCallsign,
    adif,
  });
  if (normalizedApiKey) {
    body.set('api', normalizedApiKey);
  }
  const requestBody = body.toString();
  /*
  console.log('[Clublog] Request', {
    url: CLUBLOG_API_URL,
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    form: {
      email: normalizedEmail,
      callsign: normalizedCallsign,
      password: normalizedPassword ? '***' : '',
      api: normalizedApiKey ? '***' : '',
      adif,
    },
  });
  */
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;
  let responseText = '';

  try {
    response = await fetchImpl(CLUBLOG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody,
      signal: controller.signal,
    });

    try {
      responseText = await response.text();
    } catch {
      responseText = '';
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'Unknown Clublog request error';
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok || response.status !== 200) {
    return {
      success: false,
      error: `Clublog HTTP ${response.status}${responseText ? `: ${responseText}` : ''}`,
    };
  }

  return {
    success: true,
  };
}

module.exports = {
  submitQsoToClublog,
};
