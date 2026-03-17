const { AdiWriter } = require('../adif/AdiWriter');
const { enrichQsoComment } = require('./qsoLoggingUtils');

const QRZ_LOGBOOK_API_URL = 'https://logbook.qrz.com/api';

function buildSingleQsoAdif(qso) {
  const writer = new AdiWriter('wsjtx-relay', '1.0');
  return writer.writeFldigiLine(enrichQsoComment(qso) || {});
}

function parseQrzResponseFields(bodyText) {
  const text = String(bodyText || '').trim();
  if (!text) {
    return {};
  }

  const unquoted = text.replace(/^"([\s\S]*)"$/, '$1');
  const fields = {};
  const params = new URLSearchParams(unquoted);

  for (const [key, value] of params.entries()) {
    fields[String(key || '').trim().toUpperCase()] = String(value || '').trim();
  }

  return fields;
}

async function submitQsoToQrz({ fetchImpl, apiKey, qso, timeoutMs = 10000 }) {
  if (typeof fetchImpl !== 'function') {
    return { success: false, error: 'Fetch is not available' };
  }

  const normalizedApiKey = String(apiKey || '').trim();
  if (!normalizedApiKey) {
    return { success: false, error: 'Missing QRZ API key' };
  }

  const adif = buildSingleQsoAdif(qso);
  const body = new URLSearchParams({
    KEY: normalizedApiKey,
    ACTION: 'INSERT',
    ADIF: adif,
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;
  let responseText = '';

  try {
    response = await fetchImpl(QRZ_LOGBOOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    responseText = await response.text();
  } catch (error) {
    const message = error && error.message ? error.message : 'Unknown QRZ request error';
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    return {
      success: false,
      error: `QRZ HTTP ${response.status}`,
      responseText,
    };
  }

  const responseFields = parseQrzResponseFields(responseText);
  const resultValue = String(responseFields.RESULT || '').toUpperCase();
  if (resultValue !== 'OK') {
    return {
      success: false,
      error: 'QRZ response did not indicate success',
      responseText,
    };
  }

  const logId = String(responseFields.LOGID || responseFields.LOGIDS || '').trim();

  return {
    success: true,
    logId,
    responseText,
  };
}

module.exports = {
  submitQsoToQrz,
};
