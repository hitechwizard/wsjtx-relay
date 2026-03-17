const DEFAULT_ACTIVITY_PACKET_FILTERS = [
  'Heartbeat',
  'Status',
  'Decode',
  'QSO Logged',
  'Logged ADIF',
  'SYSTEM',
];

function readSettingsSnapshot(store, options = {}) {
  const { includeQsos = false, themeFallback } = options;

  const settings = {
    listenPort: store.get('listenPort'),
    forwards: store.get('forwards'),
    autoStartRelay: store.get('autoStartRelay', false),
    usePotaSpotMap: store.get('usePotaSpotMap', false),
    qrzLoggingEnabled: store.get('qrzLoggingEnabled', false),
    qrzApiKey: store.get('qrzApiKey', ''),
    clublogLoggingEnabled: store.get('clublogLoggingEnabled', false),
    clublogCallsign: store.get('clublogCallsign', store.get('clublogUsername', '')),
    clublogPassword: store.get('clublogPassword', ''),
    clublogEmail: store.get('clublogEmail', ''),
    forwardDelaySeconds: store.get('forwardDelaySeconds', 0.5),
    decodeSightingExpirationMinutes: store.get('decodeSightingExpirationMinutes', 5),
    activityPacketFilters: store.get('activityPacketFilters', [...DEFAULT_ACTIVITY_PACKET_FILTERS]),
    theme:
      themeFallback === undefined ? store.get('theme') : store.get('theme', String(themeFallback)),
  };

  if (includeQsos) {
    settings.qsos = store.get('qsos');
  }

  return settings;
}

module.exports = {
  DEFAULT_ACTIVITY_PACKET_FILTERS,
  readSettingsSnapshot,
};
