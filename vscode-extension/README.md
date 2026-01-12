# NZR Dev Plugin

Remote VSCode control from mobile devices. Access your development environment from anywhere using your smartphone.

## Features

- **QR Code Pairing** - Quickly connect your mobile device by scanning a QR code
- **Local Network Discovery** - Automatic mDNS/Bonjour discovery for devices on the same network
- **Internet Tunnel** - Access your VSCode from anywhere via 4G/LTE (no cloud server required!)
- **Real-time Sync** - WebSocket-based communication for instant updates
- **Multi-device Support** - Connect multiple devices simultaneously
- **Zero Infrastructure Cost** - Everything runs locally on your machine

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VSCode Extension                         │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │   WebSocket   │  │  Relay Lite   │  │     Tunnel      │  │
│  │    Server     │  │  (in-memory)  │  │  (localtunnel)  │  │
│  │    :3002      │  │    :3004      │  │                 │  │
│  └───────────────┘  └───────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↑                    ↑                   ↑
    Same WiFi            Same WiFi           Internet (4G)
    (direct)             (direct)            (via tunnel)
```

### Connection Modes

| Mode | Use Case | Requirements |
|------|----------|--------------|
| **Local WiFi** | Phone and PC on same network | Same WiFi network |
| **Internet Tunnel** | Access from anywhere (4G/LTE) | Click "Toggle Tunnel" |

## Installation

1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "NZR Dev Plugin"
4. Click Install

## Getting Started

### Local WiFi Mode (Default)
1. Connect your phone to the same WiFi as your computer
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `NZR Dev: Generate Pairing QR Code`
4. Scan the QR code with the NZR Dev mobile app

### Internet Mode (4G/LTE)
1. Run `NZR Dev: Toggle Internet Tunnel` to start the tunnel
2. Wait for the tunnel URL to appear in the notification
3. Run `NZR Dev: Generate Pairing QR Code`
4. Scan the QR code - it now includes the tunnel URL
5. Connect from anywhere!

## Commands

| Command | Description |
|---------|-------------|
| `NZR Dev: Generate Pairing QR Code` | Generate a QR code to pair with mobile app |
| `NZR Dev: Show Connected Devices` | View list of connected mobile devices |
| `NZR Dev: Disconnect All Devices` | Disconnect all paired devices |
| `NZR Dev: Toggle Internet Tunnel` | Start/stop the internet tunnel for remote access |
| `NZR Dev: Show Configuration` | Display current extension configuration |

## Configuration

Configure the extension in VSCode Settings (`Ctrl+,` / `Cmd+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `nzr-dev.localPort` | `3002` | Local WebSocket server port for direct connections |
| `nzr-dev.relayPort` | `3004` | Relay server port (used for tunnel connections) |
| `nzr-dev.enableMdns` | `true` | Enable mDNS/Bonjour discovery for local network |
| `nzr-dev.autoStartTunnel` | `false` | Automatically start tunnel on extension activation |

## Status Bar

The extension adds two status bar items:

- **NZR: Ready/[Device Names]** - Shows connection status and connected devices
- **Tunnel: On/Off** - Shows tunnel status (click to toggle)

## How the Tunnel Works

The tunnel feature uses [localtunnel](https://localtunnel.me) to create a secure public URL for your local relay server:

1. When you enable the tunnel, a unique public URL is generated (e.g., `https://abc123.loca.lt`)
2. This URL is included in the QR code
3. Your mobile app connects to this URL when outside your local network
4. All traffic is routed through the tunnel to your local VSCode
5. No data is stored on external servers - it's just a pipe!

**Note:** The tunnel URL changes each time you restart. For a persistent URL, consider upgrading to localtunnel pro or using Cloudflare Tunnel with your own domain.

## Requirements

- VSCode 1.85.0 or higher
- NZR Dev mobile app (iOS/Android)
- For local connections: devices on the same network
- For tunnel connections: internet access

## Privacy & Security

- All local connections use WebSocket (WS)
- Tunnel connections use secure WebSocket (WSS) via localtunnel
- Pairing codes expire after 5 minutes
- Session tokens have configurable expiration
- No external servers required - everything runs on your machine
- Tunnel is just a passthrough - no data is stored

## Troubleshooting

**QR Code not scanning?**
- Ensure your mobile device camera has permission
- Try regenerating the QR code
- Check that both devices are on the same network (for local mode)

**Tunnel not connecting?**
- Check your internet connection
- Try toggling the tunnel off and on
- The tunnel service may be temporarily unavailable - try again later

**Can't connect via 4G?**
- Make sure the tunnel is enabled (status bar shows "Tunnel: On")
- Regenerate the QR code after enabling the tunnel
- Check if your mobile carrier blocks WebSocket connections

**Connection drops frequently?**
- Check network stability
- The tunnel automatically reconnects up to 3 times

## License

MIT

## Support

- [Report Issues](https://github.com/nzrgroup/nzr-dev-plugin/issues)
- [Documentation](https://github.com/nzrgroup/nzr-dev-plugin)
