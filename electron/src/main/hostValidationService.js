async function validateForwardHostLookup(dnsModule, host) {
  const normalizedHost = String(host || '').trim();

  if (!normalizedHost) {
    return { valid: false, error: 'Host is required' };
  }

  try {
    const results = await dnsModule.promises.lookup(normalizedHost, {
      family: 4,
      all: true,
      verbatim: true,
    });

    if (!Array.isArray(results) || results.length === 0) {
      return { valid: false, error: 'Host did not resolve to an IPv4 address' };
    }

    return {
      valid: true,
      addresses: results.map((entry) => entry.address).filter(Boolean),
    };
  } catch (error) {
    return {
      valid: false,
      error: error && error.message ? error.message : 'Host lookup failed',
    };
  }
}

module.exports = {
  validateForwardHostLookup,
};
