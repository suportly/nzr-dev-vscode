# Changelog

All notable changes to "NZR Dev Plugin" will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-12

### Added
- Initial release
- QR Code pairing with mobile devices
- Local WiFi connection support via WebSocket
- Internet tunnel for remote access (4G/LTE) using localtunnel
- mDNS/Bonjour discovery for automatic device detection
- File browsing and reading
- File editing and saving
- Terminal access with command execution
- Streaming terminal output
- AI chat integration (supports GitHub Copilot, Continue, etc.)
- Git/Source control operations (status, diff, stage, unstage, discard)
- Diagnostics viewer (errors, warnings)
- Multi-device support
- Status bar indicators for connection and tunnel status

### Security
- Token-based authentication for device pairing
- Automatic session expiration (configurable)
- Secure WebSocket connections via tunnel (WSS)
- PIN code verification for pairing
