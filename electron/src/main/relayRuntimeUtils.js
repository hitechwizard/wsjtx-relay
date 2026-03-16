function stopRelayIfRunning(relayInstance) {
  if (relayInstance && relayInstance.running) {
    relayInstance.stop();
  }
}

async function resendViaRelay(relayInstance, qsosOrQso) {
  if (!relayInstance) {
    return { success: false, error: 'Relay not available' };
  }

  try {
    if (!relayInstance.running) {
      relayInstance.start();
    }
    await relayInstance.resendQsos(qsosOrQso);

    if (Array.isArray(qsosOrQso)) {
      return { success: true, count: qsosOrQso.length };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  stopRelayIfRunning,
  resendViaRelay,
};
