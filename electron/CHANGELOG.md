# Changelog

## Unreleased (pending 1.0.1)

### Added

- Introduced a shared QSO field schema and normalization module: `ui/qso-fields.js`.
- Added configurable per-endpoint enable/disable controls in Settings.
- Added a configurable forward resend delay (`forwardDelaySeconds`) with default `0.5` seconds.
- Added a call filter textbox in the QSO log header for live filtering as users type.
- Added a QSO counter for the current day.
- Added show/hide capability for Manual QSO and Status sections
- Added packet filter options for the activity log

### Changed

- Refactored QSO Editor form rendering to be driven by shared field metadata (instead of hardcoded fields).
- Unified calculated-field behavior via shared normalization:
  - `band` calculated from `freq` and shown as read-only.
  - `sig`/`my_sig` derived from `sig_info`/`my_sig_info`.
- Enforced uppercase normalization for:
  - `call`, `station_callsign`
  - `state`, `my_state`
  - `gridsquare`, `sig_info`, `my_sig_info` where applicable.
- Added park reference normalization for `sig_info`/`my_sig_info`:
  - Pattern: `^[A-Z]{2}-[0-9]{4}[0-9]?$`
  - Numeric-only values auto-prefixed as `US-####` or `US-#####`.
- Updated main-window theme toggle to icon-based interaction with hidden checkbox state.
- Updated status indicator forward list to show enabled forwards only.
- Updated Reply log entry to include the mode and message.

### Fixed

- Corrected band display mismatch by aligning calculated band values with configured enum values.
- Ensured dark-theme QSO editor select controls render readable text in closed state.
- Enforced pattern validation in QSO Editor at field-change/blur flow.
- Extended equivalent blur-time preprocessing/validation to manual QSO entry inputs.
- Made QSO log filtering actually hide rows by adding explicit CSS for hidden rows.
- Kept QSO total count independent of active call filter.
- Persisted and restored window bounds for Settings and QSO Editor dialogs.
- Updated relay forwarding behavior to skip disabled endpoints for live forwarding and resend.
- Applied delay pacing between QSOs when resending an entire log to forward endpoints.
- Updated ADIF date formatting imports for compatibility with `dateformat` v5 CommonJS usage.
- Cleared all production (`--omit=dev`) audit vulnerabilities.

### Updated

- Bumped app version in `package.json` from `1.0.0` to `1.0.1`.
- Upgraded dependencies:
  - `electron` from `40.4.1` to `40.6.0`
  - `electron-builder` from `26.7.0` to `26.8.1`
  - `dateformat` from `1.0.12` to `5.0.3`
- Refreshed lockfile after dependency updates and audit remediation.
