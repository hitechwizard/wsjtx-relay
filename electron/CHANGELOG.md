# Changelog

## 1.0.9 - 04/23/2026

### Fixed

- Fixed automatic `My Park` clearing so configuration-name derived park values are removed when the current WSJT-X configuration no longer uses the `[callsign]@[park id]` format.

## 1.0.8 - 03/26/2026

### Added

- Added per-QSO show/hide toggle controls in QSO Editor card headers.
- Added a callsign filter field in QSO Editor for live filtering of displayed QSO cards.
- Added upstream WSJT-X `Highlight Call` packet support (type `13`) in the relay.
- Added automatic upstream highlight sending for recognized POTA activator decodes when SNR is captured.

### Changed


### Fixed


## 1.0.7 - 03/14/2026

### Fixed

- Correct Clublog publishing issue

## 1.0.6 - 03/13/2026

### Added

- Added `Offset` column to POTA Spots (placed between Frequency and Mode), populated from matched decode `delta_freq`.
- Added explicit `Action` column in POTA Spots with per-row actions:
  - `Manual` for `SSB`/`CW`
  - `Reply` for other modes
- Added QRZ reporting integration for saved QSOs:
  - submits ADIF via QRZ Logbook API when enabled
  - persists provider submission metadata in per-QSO `logSubmissions`
  - displays a `QRZ` badge in the QSO log when submission succeeds
- Added Clublog reporting integration for saved QSOs:
  - submits ADIF via Clublog realtime API when enabled
  - persists provider submission metadata in per-QSO `logSubmissions`
  - displays a `CLUBLOG` badge in the QSO log when submission succeeds
- Added publish-time Clublog API key injection using `CLUBLOG_API_KEY` (not committed to repository).
- Added support for creating blank QSOs directly in QSO Editor via `Add Blank QSO`.
- Added major Electron main-process modularization into focused updater, relay, POTA, lifecycle, window, and IPC components.
- Added centralized runtime app state management for window, relay, and updater references.
- Added shared main-process configuration/default helpers for constants, UI paths, icon resolution, and store defaults.

### Changed

- Replaced hidden POTA row double-click behavior with explicit action buttons.
- Updated POTA spot-time behavior so spots seen via decode use the decode timestamp for displayed Spot Time, Age, and related sorting.
- Expanded POTA Region filter to support full location values (e.g. `US-TX`) and kept input normalized to uppercase.
- Updated POTA location filtering to correctly match comma-separated API location lists (e.g. `US-LA,US-TX`).
- Updated logging submission tracking to use provider-scoped `logSubmissions` metadata instead of custom ADIF fields.
- Reduced POTA header vertical footprint and moved filters onto the same row where space permits.
- Updated QSO ordering so full-log sorting by timestamp occurs when saving edited QSOs (`update-qsos`).
- Refactored the Electron main entrypoint from a monolith into orchestration wiring over extracted modules.
- Consolidated preload IPC subscription handling with reusable wrappers that support listener disposal.
- Updated renderer windows to register and dispose IPC subscriptions on unload.
- Replaced multiple inline UI styles with shared stylesheet classes for maintainability.

### Fixed

- Fixed synthesized CQ POTA spots not being marked as worked immediately after logging (before API promotion).
- Fixed POTA row focus behavior so selecting an action does not hide the POTA window behind the main window.
- Fixed WSJT-X reply packet construction/routing to use exact decode-derived values and endpoint context.
- Disabled `Reply` action when a row has no valid decode SNR or is already worked.
- Hardened renderer pages with explicit Content Security Policy (CSP) meta tags.
- Strengthened IPC payload validation and sanitization for settings, QSO, and POTA flows.

## 1.0.5 - 03/12/2026

### Added

- Added `my_state` and `state` fields to the QSO editor field schema with uppercase normalization.
- Added `my_gridsquare` field to the QSO editor with grid square validation pattern.
- Added native macOS `Edit` menu with standard keyboard shortcuts:
  - Undo/Redo
  - Cut/Copy/Paste
  - Paste and Match Style (macOS only)
  - Delete
  - Select All
- Added "Set My Park" button in QSO Editor to bulk-update all QSOs:
  - Opens modal dialog to enter park reference (format: `XX-####` or `XX-#####`)
  - Validates park reference format
  - Updates `my_sig_info` and sets `my_sig` to `POTA` for all entries
  - Supports Enter key to confirm, Escape to cancel
- Added `Auto Start Relay` setting in Settings.
- Added `Use POTA Spot Map` setting in Settings.
- Added a `POTA Spots` window in the Window menu with sortable columns and filters for mode, band, and region prefix (`locationDesc` first two characters).
- Added persistence for POTA Spots window bounds and active filters (mode, band, region) across reopen.
- Added `Age` column to POTA Spots table showing minutes since spot time.
- Added worked-spot marking in POTA Spots: rows matching a same-day QSO in the log (callsign, mode, band) are shown with strikethrough and dimmed text.
- Added last-update timestamp inline in the POTA Spots window title and header.
- Added POTA Spots indicator for stations already worked.
- Added POTA Spots filter to hide already worked stations.

### Changed

- Updated Settings to allow FQDN in addition to IPv4 addresses in the forwarders list.
- Updated QSO editor field preprocessing to auto-uppercase `my_state`, `state`, and `my_gridsquare` on input.
- Replaced unsupported `prompt()` with custom modal dialog in QSO editor.
- Standardized submode handling to use `submode` consistently in parser and UI normalization paths.
- When `Use POTA Spot Map` is enabled, new QSO persistence now checks `https://api.pota.app/spot/activator` and enriches matching QSOs by:
  - filling `gridsquare` from `grid4` if no DX grid is already set
  - setting `sig_info` from the spot reference
  - setting `sig` to `POTA`
- Updated POTA Spots frequency handling to convert API `frequency` values from kHz to MHz for display and band filtering.
- Updated POTA Spots time display to match QSO Log format (`MM-DD @ HH:MM`) using UTC values.
- Updated POTA Spots to auto-refresh every 60 seconds; removed manual refresh button.
- Double-clicking a POTA Spot row populates the Manual QSO form with the activator call, park reference, and state.

### Fixed

- Fixed clipboard operations (cut/copy/paste) not working on macOS in QSO editor text fields.
- Fixed QSO Log mode display so MFSK entries show submode when present.
- Fixed QSO duplicate detection for MFSK entries to compare submode when available.
- Fixed POTA Spots table layout rendering.
- Fixed POTA Spots spot age calculation to treat `spotTime` values without a timezone suffix as UTC.
- Fixed QSO Logged packet date/time encoding for manually entered QSOs.
- Fixed secondary windows on macOS (Examples, Settings, QSO Editor, POTA Spots) to restore and return to the foreground reliably when reopened from menus/window list.

## 1.0.4 - 03/05/2026

### Changed

- Update plist on Mac to allow application to perform upgrades.
- Emit QSO Logged packet in addition to the Logged ADIF packet for Manual QSO Entries.

### Fixed

- Fixes for Windows icon.

## 1.0.3 - 02/26/2026

### Added

- Implemented a full Help → Examples page (`ui/example.html`) with:
  - Application configuration walkthrough images sourced from `assets/examples`
  - Port mapping examples (`2237` listen, relays to `2238`, `2239`, `2240`)
  - Explicit bidirectional relay behavior notes for reply packet routing back to WSJT-X
  - A left-to-right flow diagram mirroring the WSJT-X Relay logo layout (WSJT-X → Relay → applications)
- Added click-to-expand image viewing on the Examples page, including per-image setup instructions in a modal.
- Added an Activity Log `RX` packet indicator that blinks when packets are received, even when packet filters hide log lines.

### Changed

- Normalized QSO Log row height so rows stay visually consistent when POTA icon indicators are present.
- Set QSO Log rows to fixed height for uniform rendering across icon/no-icon entries.
- Replaced the Help menu Examples placeholder popup with a dedicated Examples window.

### Fixed

- Updated Manual QSO Entry validation so `Log Contact` is disabled until required fields have values:
  - `Mode`
  - `Frequency`
  - `Band`
  - `Time On`
  - `DX Call`
  - `RST Sent`
  - `RST Rcvd`
  - `DE Call`
  - `DE Gridsquare`
- Added live enable/disable refresh for `Log Contact` on input/change and after `Now`/reset flows.
- Updated Frequency numeric inputs to accept floating-point values (`step="any"`) so browser validation no longer enforces integer-only values.

## 1.0.2 - 02/24/2026

### Added

- Added dedicated run scripts for common Electron launch modes:
  - `start:debug` (`--inspect=9229`)
  - `start:debug-brk` (`--inspect-brk=9229`)
  - `start:devtools` (`--auto-open-devtools-for-tabs`)
  - `start:trace` (`--enable-logging`)
- Added a per-QSO `Raw Data` action in QSO Editor that opens a modal showing raw field names and values.
- Added a publish helper script (`scripts/publish.js`) that resolves GitHub token from:
  - `GH_TOKEN`
  - `GITHUB_TOKEN`
  - `gh auth token`
- Added a dedicated Windows icon asset (`assets/icon.ico`) and explicit `build.win.icon` configuration.

### Changed

- Reworked app branding icon assets:
  - Updated `assets/icon-source.svg` with new WSJT-X Relay design treatment.
  - Regenerated `assets/icon.png` from source.
- Updated macOS build targets to include both `dmg` and `zip` so `latest-mac.yml` update metadata is generated.
- Updated publish npm scripts to use the token-aware publish helper.
- Relocated Manual QSO `Now` button into the `Time On` field header and right-aligned it.

### Fixed

- Fixed updater badge behavior so `Update Available` is only shown when the release version is newer than the running app version.
- Improved updater error handling when release metadata is missing (`latest-mac.yml`):
  - clears stale update badge state
  - shows a clearer actionable error message
- Fixed main-window status synchronization after saving Settings:
  - forwards indicator now refreshes immediately
  - listen port/status settings refresh via `settings-changed` IPC event
- Fixed repository ignore behavior for macOS metadata by changing root `.gitignore` to ignore `.DS_Store` files at any depth.

### Notes

- Local build artifacts now generate `latest.yml`, `latest-mac.yml`, and `latest-linux.yml` for release asset upload workflows.

## 1.0.1 - 02/22/2026

### Added

- Introduced a shared QSO field schema and normalization module: `ui/qso-fields.js`.
- Added configurable per-endpoint enable/disable controls in Settings.
- Added a configurable forward resend delay (`forwardDelaySeconds`) with default `0.5` seconds.
- Added a call filter textbox in the QSO log header for live filtering as users type.
- Added a QSO counter for the current day.
- Added show/hide capability for Manual QSO and Status sections.
- Added packet filter options for the activity log.
- Added setting My Park if the WSJT-X configuation name is in [callsign]@[park id] format.

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

## 1.0.0 - 02/19/2026

### Added

- Initial public release of WSJT-X Relay.
