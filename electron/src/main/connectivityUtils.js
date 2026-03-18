async function hasInternetConnectivity({ dnsModule, timeoutMs, host = 'github.com' }) {
  const connectivityCheck = dnsModule.promises
    .lookup(host)
    .then(() => true)
    .catch(() => false);

  const timeoutCheck = new Promise((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });

  return Promise.race([connectivityCheck, timeoutCheck]);
}

module.exports = {
  hasInternetConnectivity,
};
