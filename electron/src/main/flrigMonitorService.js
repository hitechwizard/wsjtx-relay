const http = require('http');

const DEFAULT_FLRIG_ENDPOINT = '127.0.0.1:12345';
const DEFAULT_POLL_INTERVAL_MS = 1500;

function parseFlrigEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const separatorIndex = raw.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
    return null;
  }

  const host = raw.slice(0, separatorIndex).trim();
  const port = Number.parseInt(raw.slice(separatorIndex + 1).trim(), 10);

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { host, port };
}

function xmlEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildXmlRpcBody(methodName, params = []) {
  const serializedParams = Array.isArray(params)
    ? params
        .map((param) => {
          const type = String(param?.type || 'string')
            .trim()
            .toLowerCase();
          if (type === 'double' || type === 'int' || type === 'i4' || type === 'boolean') {
            return `<param><value><${type}>${xmlEscape(param?.value)}</${type}></value></param>`;
          }
          return `<param><value><string>${xmlEscape(param?.value)}</string></value></param>`;
        })
        .join('')
    : '';

  return `<?xml version="1.0"?>\n<methodCall><methodName>${xmlEscape(methodName)}</methodName><params>${serializedParams}</params></methodCall>`;
}

const FLRIG_RPC_PATHS = ['/RPC2', '/xmlrpc', '/XMLRPC', '/'];
const FLRIG_FREQUENCY_METHODS = [
  'rig.get_vfo',
  'rig.get_vfoA',
  'rig.get_vfoB',
  'rig.get_freq',
  'rig.get_frequency',
];
const FLRIG_TRANSMIT_METHODS = ['rig.get_ptt', 'rig.get_trx_status'];
const FLRIG_POWER_METHODS = ['rig.get_power'];
const FLRIG_SWR_METHODS = ['rig.get_SWR'];
const FLRIG_SET_FREQUENCY_METHODS = ['rig.set_frequency', 'rig.set_vfo'];
const FLRIG_SET_MODE_METHODS = ['rig.set_mode'];

const FLRIG_SWR_TIMEOUT_MS = 1800;

function extractXmlRpcValue(xml) {
  if (/<fault>/i.test(xml)) {
    const faultCodeMatch = xml.match(
      /<name>\s*faultCode\s*<\/name>[\s\S]*?<value>\s*(?:<i4>|<int>|<double>)?\s*([^<\s]+)\s*(?:<\/i4>|<\/int>|<\/double>)?\s*<\/value>/i,
    );
    const faultStringMatch = xml.match(
      /<name>\s*faultString\s*<\/name>[\s\S]*?<value>\s*(?:<string>)?\s*([^<]*)\s*(?:<\/string>)?\s*<\/value>/i,
    );
    const faultCode = faultCodeMatch ? String(faultCodeMatch[1]).trim() : 'unknown';
    const faultString = faultStringMatch
      ? String(faultStringMatch[1]).trim()
      : 'flrig XML-RPC fault response';
    throw new Error(`flrig XML-RPC fault ${faultCode}: ${faultString}`);
  }

  const patterns = [
    /<boolean>(.*?)<\/boolean>/is,
    /<i4>(.*?)<\/i4>/is,
    /<int>(.*?)<\/int>/is,
    /<double>(.*?)<\/double>/is,
    /<string>(.*?)<\/string>/is,
    /<value>([^<]+)<\/value>/is,
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1] !== undefined) {
      return String(match[1]).trim();
    }
  }

  throw new Error('flrig XML-RPC response did not include a scalar value');
}

function callFlrigMethod({
  host,
  port,
  methodName,
  params = [],
  timeoutMs = 1200,
  path = '/RPC2',
}) {
  return new Promise((resolve, reject) => {
    const body = buildXmlRpcBody(methodName, params);

    const request = http.request(
      {
        host,
        port,
        method: 'POST',
        path,
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });

        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`flrig HTTP ${response.statusCode}`));
            return;
          }

          try {
            resolve(extractXmlRpcValue(responseBody));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('flrig timeout'));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.write(body);
    request.end();
  });
}

async function callFlrigMethodWithPathFallback(endpoint, methodName, options = {}) {
  let lastError = null;

  for (const path of FLRIG_RPC_PATHS) {
    try {
      return await callFlrigMethod({
        ...endpoint,
        methodName,
        ...options,
        path,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('flrig XML-RPC call failed');
}

async function callFirstAvailableMethod(endpoint, methodNames, options = {}) {
  let lastError = null;

  for (const methodName of methodNames) {
    try {
      const value = await callFlrigMethodWithPathFallback(endpoint, methodName, options);
      return { methodName, value };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No flrig XML-RPC method succeeded');
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFrequencyMhz(rawValue) {
  const numeric = toFiniteNumber(rawValue);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  // flrig generally returns Hz, but handle MHz-friendly values defensively.
  if (numeric >= 1000) {
    return Number((numeric / 1000000).toFixed(4));
  }

  return Number(numeric.toFixed(4));
}

function toBooleanFromRigValue(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

function parseInfoFallback(infoValue) {
  const info = String(infoValue || '');

  const frequencyMatch = info.match(/\b(\d{7,11})\b/);
  const frequency = frequencyMatch ? toFrequencyMhz(frequencyMatch[1]) : null;

  const lower = info.toLowerCase();
  let transmitting = null;
  if (lower.includes('tx')) {
    transmitting = true;
  } else if (lower.includes('rx')) {
    transmitting = false;
  }

  return { frequency, transmitting };
}

function formatTxPower(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '';
  }

  if (numeric >= 0 && numeric <= 1) {
    return String(Math.round(numeric * 100));
  }

  return String(Number(numeric.toFixed(2)));
}

function normalizeSWR(value) {
  const directNumeric = toFiniteNumber(value);
  const parsedNumeric =
    directNumeric !== null
      ? directNumeric
      : (() => {
          const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
          return match ? toFiniteNumber(match[0]) : null;
        })();

  const numeric = parsedNumeric;
  if (numeric === null || numeric <= 0) {
    return null;
  }

  // Ignore non-ratio meter-style values to avoid showing misleading SWR.
  if (numeric > 10) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

function createFlrigMonitor({
  store,
  onStatusUpdate,
  onError,
  onDebugLog,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  let pollTimer = null;
  let isPolling = false;
  let enabled = false;
  let endpoint = DEFAULT_FLRIG_ENDPOINT;
  let lastErrorMessage = '';
  let lastErrorAtMs = 0;
  let connected = false;
  let lastKnownStatus = {
    frequency: null,
    transmitting: false,
    txPower: '',
    swr: null,
  };

  const stop = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const pollOnce = async () => {
    if (!enabled || isPolling) {
      return;
    }

    const parsedEndpoint = parseFlrigEndpoint(endpoint);
    if (!parsedEndpoint) {
      onError && onError('flrig endpoint is invalid; expected host:port');
      return;
    }

    isPolling = true;
    try {
      const versionProbe = await callFirstAvailableMethod(parsedEndpoint, [
        'main.get_version',
      ]).catch(() => null);

      const [frequencyResult, transmittingResult] = await Promise.all([
        callFirstAvailableMethod(parsedEndpoint, FLRIG_FREQUENCY_METHODS).catch(() => null),
        callFirstAvailableMethod(parsedEndpoint, FLRIG_TRANSMIT_METHODS).catch(() => null),
      ]);

      let infoFallbackResult = null;
      if (!frequencyResult && !transmittingResult) {
        infoFallbackResult = await callFirstAvailableMethod(parsedEndpoint, [
          'rig.get_info',
        ]).catch(() => null);
      }

      if (!frequencyResult && !transmittingResult && !infoFallbackResult) {
        throw new Error('core flrig methods returned no usable value');
      }

      const optionalPowerResult = await callFirstAvailableMethod(
        parsedEndpoint,
        FLRIG_POWER_METHODS,
        { timeoutMs: 900 },
      ).catch(() => null);

      let optionalSWRResult = null;

      if (frequencyResult) {
        const frequency = toFrequencyMhz(frequencyResult.value);
        if (frequency !== null) {
          lastKnownStatus.frequency = frequency;
        }
      } else if (infoFallbackResult) {
        const parsedInfo = parseInfoFallback(infoFallbackResult.value);
        if (parsedInfo.frequency !== null) {
          lastKnownStatus.frequency = parsedInfo.frequency;
        }
      }

      if (transmittingResult) {
        lastKnownStatus.transmitting = toBooleanFromRigValue(transmittingResult.value);
      } else if (infoFallbackResult) {
        const parsedInfo = parseInfoFallback(infoFallbackResult.value);
        if (parsedInfo.transmitting !== null) {
          lastKnownStatus.transmitting = parsedInfo.transmitting;
        }
      }

      if (lastKnownStatus.transmitting) {
        optionalSWRResult = await callFirstAvailableMethod(parsedEndpoint, FLRIG_SWR_METHODS, {
          timeoutMs: FLRIG_SWR_TIMEOUT_MS,
        }).catch((error) => {
          if (onDebugLog) {
            onDebugLog(`flrig get_swr failed while transmitting: ${error.message}`);
          }
          return null;
        });
      }

      if (optionalPowerResult) {
        lastKnownStatus.txPower = formatTxPower(optionalPowerResult.value);
      }

      if (optionalSWRResult) {
        lastKnownStatus.swr = normalizeSWR(optionalSWRResult.value);
        if (onDebugLog) {
          onDebugLog(
            `flrig swr normalize: raw=${optionalSWRResult.value} normalized=${String(lastKnownStatus.swr)}`,
          );
        }
      }

      if (onDebugLog) {
        const debugParts = [
          `endpoint=${parsedEndpoint.host}:${parsedEndpoint.port}`,
          `version=${versionProbe ? `${versionProbe.methodName}:${versionProbe.value}` : 'none'}`,
          `freq=${frequencyResult ? `${frequencyResult.methodName}:${frequencyResult.value}` : 'none'}`,
          `ptt=${transmittingResult ? `${transmittingResult.methodName}:${transmittingResult.value}` : 'none'}`,
          `pwr=${optionalPowerResult ? `${optionalPowerResult.methodName}:${optionalPowerResult.value}` : 'none'}`,
          `swr=${optionalSWRResult ? `${optionalSWRResult.methodName}:${optionalSWRResult.value}` : 'none'}`,
        ];
        onDebugLog(`flrig poll responses: ${debugParts.join(' | ')}`);
      }

      onStatusUpdate &&
        onStatusUpdate({
          source: 'flrig',
          flrigConnected: Boolean(
            versionProbe || frequencyResult || transmittingResult || infoFallbackResult,
          ),
          frequency: lastKnownStatus.frequency,
          transmitting: lastKnownStatus.transmitting,
          txPower: lastKnownStatus.txPower,
          swr: lastKnownStatus.swr,
        });
      connected = Boolean(
        versionProbe || frequencyResult || transmittingResult || infoFallbackResult,
      );
      lastErrorMessage = '';
      lastErrorAtMs = 0;
    } catch (error) {
      const message = `flrig status poll failed: ${error.message}`;
      const now = Date.now();
      if (onError && (message !== lastErrorMessage || now - lastErrorAtMs > 15000)) {
        onError(message);
        lastErrorMessage = message;
        lastErrorAtMs = now;
      }
      onStatusUpdate &&
        onStatusUpdate({
          source: 'flrig',
          flrigConnected: false,
          transmitting: false,
          txPower: '',
          swr: null,
        });
      connected = false;
    } finally {
      isPolling = false;
    }
  };

  const start = () => {
    stop();
    if (!enabled) {
      return;
    }

    pollOnce();
    pollTimer = setInterval(pollOnce, pollIntervalMs);
  };

  const applySettings = ({ nextEnabled, nextEndpoint }) => {
    enabled = Boolean(nextEnabled);
    endpoint = String(nextEndpoint || DEFAULT_FLRIG_ENDPOINT).trim() || DEFAULT_FLRIG_ENDPOINT;

    if (!enabled) {
      stop();
      connected = false;
      onStatusUpdate &&
        onStatusUpdate({
          source: 'flrig',
          disabled: true,
          flrigConnected: false,
          transmitting: false,
          txPower: '',
          swr: null,
        });
      return;
    }

    start();
  };

  const refreshFromStore = () => {
    applySettings({
      nextEnabled: store.get('flrigEnabled', store.get('rigctldEnabled', false)),
      nextEndpoint: store.get(
        'flrigEndpoint',
        store.get('rigctldEndpoint', DEFAULT_FLRIG_ENDPOINT),
      ),
    });
  };

  const dispose = () => {
    stop();
    connected = false;
  };

  const isConnected = () => enabled && connected;

  const tuneFrequencyHz = async (frequencyHz) => {
    const numericHz = Number(frequencyHz);
    if (!Number.isFinite(numericHz) || numericHz <= 0) {
      return { success: false, error: 'Invalid frequency value' };
    }

    if (!isConnected()) {
      return { success: false, error: 'flrig is not connected' };
    }

    const parsedEndpoint = parseFlrigEndpoint(endpoint);
    if (!parsedEndpoint) {
      return { success: false, error: 'flrig endpoint is invalid; expected host:port' };
    }

    try {
      const frequencyMHz = numericHz / 1000000;
      const targetMode = frequencyMHz < 10 ? 'LSB' : 'USB';

      const modeResult = await callFirstAvailableMethod(parsedEndpoint, FLRIG_SET_MODE_METHODS, {
        timeoutMs: 1200,
        params: [{ type: 'string', value: targetMode }],
      });

      const frequencyResult = await callFirstAvailableMethod(
        parsedEndpoint,
        FLRIG_SET_FREQUENCY_METHODS,
        {
          timeoutMs: 1200,
          params: [{ type: 'double', value: numericHz }],
        },
      );

      onDebugLog &&
        onDebugLog(
          `flrig mode command sent: ${modeResult.methodName} ${targetMode} -> ${modeResult.value}`,
        );
      onDebugLog &&
        onDebugLog(
          `flrig tune command sent: ${frequencyResult.methodName} ${Math.round(numericHz)} Hz -> ${frequencyResult.value}`,
        );

      return {
        success: true,
        frequencyMethodName: frequencyResult.methodName,
        frequencyValue: frequencyResult.value,
        modeMethodName: modeResult.methodName,
        modeValue: modeResult.value,
        mode: targetMode,
      };
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      onDebugLog && onDebugLog(`flrig tune command failed: ${message}`);
      return { success: false, error: message };
    }
  };

  return {
    refreshFromStore,
    applySettings,
    dispose,
    isConnected,
    tuneFrequencyHz,
  };
}

module.exports = {
  DEFAULT_FLRIG_ENDPOINT,
  parseFlrigEndpoint,
  createFlrigMonitor,
};
