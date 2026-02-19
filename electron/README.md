# WSJT-X Relay - Electron App

A modern desktop application for relaying WSJT-X UDP packets between multiple endpoints.

## Features

- **UDP Relay Server**: Listens on localhost and forwards packets to configured endpoints
- **Settings GUI**: Configure listen port and forward endpoints through an intuitive interface
- **Activity Log**: Real-time monitoring of relay activity
- **Start/Stop Control**: Easy relay management with status indication
- **Persistent Configuration**: Settings are saved automatically

## Installation

### Prerequisites

- Node.js 14+ and npm
- Electron (will be installed by npm)

### Setup

1. Navigate to the electron directory:

```bash
cd electron
```

2. Install dependencies:

```bash
npm install
```

## Usage

### Starting the Application

```bash
npm start
```

### Configuration

1. Click the **Settings** button in the main window or use **Cmd+,** (Mac) / **Ctrl+,** (Windows/Linux)

2. Configure the following:
   - **Listen Port**: The port on localhost that the relay will listen on (default: 2237)
   - **Forward Endpoints**: One or more IPv4:port pairs to forward packets to

3. To add a forward endpoint:
   - Enter the endpoint in the format `host:port` (e.g., `127.0.0.1:2238`)
   - Click **Add**
   - Repeat for additional endpoints

4. Click **Save** to apply changes

### Operation

1. Click **Start** to begin the relay
2. The status badge will show "Running" when active
3. Monitor activity in the log panel
4. Click **Stop** to halt the relay

## Building for Distribution

To build the app for distribution, you can use tools like:

- **electron-builder**: For creating installers and packages
- **electron-packager**: For creating standalone apps

Example with electron-builder:

```bash
npm install --save-dev electron-builder
npx electron-builder
```

## Configuration Persistence

Settings are automatically saved to:

- **macOS**: `~/Library/Application Support/wsjtx-relay/config.json`
- **Windows**: `%APPDATA%\wsjtx-relay\config.json`
- **Linux**: `~/.config/wsjtx-relay/config.json`

## Command Line Options (Python Version)

The original Python version used these command line options:

```
-l, --listen-port   Port to listen on localhost (default: 2237)
forwards            One or more forward endpoints (host:port format)
```

**Electron equivalent**: Configure these in the Settings window instead.

## Architecture

### Main Components

- **src/main.js**: Electron main process, handles window management and IPC
- **src/relay.js**: UDP relay logic and packet forwarding
- **src/preload.js**: Secure IPC bridge between main and renderer processes
- **ui/index.html**: Main application window
- **ui/settings.html**: Settings/preferences window
- **ui/styles.css**: Application styling
- **ui/renderer.js**: Main window logic
- **ui/settings.js**: Settings window logic

### Data Flow

1. **Settings**: Stored using electron-store, persisted between sessions
2. **Relay Status**: Communicated via IPC events from main to renderer
3. **Logs**: Real-time streaming via IPC event channels

## Troubleshooting

### Port Already in Use

If you get an error that the relay port is in use:

1. Change the listen port in Settings
2. Check what other processes are using the port with:
   - **macOS/Linux**: `lsof -i :PORT_NUMBER`
   - **Windows**: `netstat -ano | findstr :PORT_NUMBER`

### Settings Not Saving

Check that the app has write permissions to its config directory.

### Relay Crashes on Startup

- Verify all forward endpoints are in valid IPv4:port format
- Ensure at least one forward endpoint is configured

## Development

### Project Structure

```
electron/
├── src/
│   ├── main.js         # Main process
│   ├── relay.js        # Relay implementation
│   ├── preload.js      # IPC preload
│   └── package.json    # Dependencies
└── ui/
    ├── index.html      # Main window
    ├── settings.html   # Settings window
    ├── styles.css      # Styling
    ├── renderer.js     # Main window logic
    └── settings.js     # Settings logic
```

### Adding New Features

1. **Add new settings**: Modify `ui/settings.html` and update save logic
2. **Add relay features**: Extend `src/relay.js` with new methods
3. **Update UI**: Modify HTML/CSS in the `ui/` directory
4. **Add IPC handlers**: Register new handlers in `src/main.js`

## Migration from Python Version

The Electron app is a complete port of the original Python application with several improvements:

| Feature       | Python            | Electron               |
| ------------- | ----------------- | ---------------------- |
| Configuration | Command line args | Settings GUI           |
| Persistence   | None              | Automatic              |
| Logging       | Console output    | In-app log panel       |
| Control       | Start at launch   | Start/stop controls    |
| Monitoring    | Terminal          | Real-time UI dashboard |

## Security Notes

- The application uses context isolation and preload scripts to prevent XSS attacks
- Node integration is disabled in renderer processes
- IPC communication is validated in main process
- Settings are stored locally without network transmission

## License

Same as the original wsjtx-relay project.
