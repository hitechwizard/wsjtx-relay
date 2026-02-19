# WSJT-X Relay

WSJT-X Relay is a desktop app that sits between WSJT-X and the rest of your station software. It lets WSJT-X share UDP traffic with multiple applications at the same time, while also giving you tools to manage and log contacts in one place.

## End-User Features

- **One-to-many UDP forwarding**: Receive WSJT-X UDP packets on one listen port and forward them to multiple endpoints (GridTracker, Hamclock, N1MM+, N3FJP, and others).
- **Bi-directional relay behavior**: Keeps packet routing working both directions so connected apps can continue exchanging WSJT-X traffic through the relay.
- **Simple start/stop control**: Start and stop the relay from the main window with clear running/stopped status.
- **Live status indicators**: View current frequency, mode, TX-enabled state, transmitting state, listen port, and active forward targets.
- **Activity log**: Monitor relay traffic and events in real time from the app.
- **Manual QSO entry**: Enter non-WSJT contacts (such as SSB/CW during POTA activations) directly in the app.
- **Built-in QSO log view**: Track logged contacts with running counts and recent activity.
- **QSO Editor window**: Review and edit saved QSOs in a dedicated editor.
- **ADIF import/export**: Import existing logs and export contacts for upload to other logging services.
- **Resend QSOs to forwarders**: Re-send one or all saved QSOs as needed.
- **Persistent settings**: Saved listen port, forward endpoints, theme, window size, and QSO data between sessions.
- **Light and dark themes**: Choose your preferred display theme.

## Typical Use

1. Configure WSJT-X to send UDP messages to the WSJT-X Relay listen port (both default to 2237).
2. Configure WSJT-X-aware applications (such as GridTracker or openHamclock) to listen on different ports (for example, 2238 and 2239).
3. In WSJT-X Relay settings, add each application address and port to the forwards list. For apps running on the same computer, use `127.0.0.1` as the address.
4. Start the relay.
5. WSJT-X packets are now forwarded to all configured targets, and responses are routed back to WSJT-X.

## Using WSJT-X Relay as a Manual Logger

WSJT-X Relay can also log non-digital contacts. When you log a manual QSO, it is forwarded to your listening applications the same way as WSJT-X traffic. This helps keep downstream services (such as QRZ, LoTW, and Club Log) in sync without separate manual uploads.

### Manual QSO Operation

1. WSJT-X acts as CAT control and updates the frequency and band fields in the Manual QSO section. If you are operating SSB or CW, you can disable WSJT-X decoding with the **Monitor** button to reduce CPU usage and quiet the activity log.
2. Fill out the fields in the Manual QSO section and click **Log Contact**.

## QSO Log Editor

WSJT-X Relay includes a QSO Log Editor for importing and exporting ADIF files. This is especially useful for building POTA activation logs. You can also resend individual QSOs or the entire log to your forward targets. That makes it easy to operate without internet access and sync those QSOs later when connectivity is restored.


