import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { Config } from './utils/config';
import { QRCodePanel } from './views/QRCodePanel';
import { PairingService, PairingResult } from './services/pairing';
import { wsServer, ConnectedClient } from './server/websocket';
import { initializeHandlers, processCommand } from './server/handlers';
import { discovery } from './utils/discovery';
import { editorService } from './services/editor';
import { relayLite } from './services/relay-lite';
import { tunnelService, TunnelState } from './services/tunnel';
import { Command } from '@nzr-dev/shared';

let logger: Logger;

/**
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
  logger = new Logger('NZR Dev Plugin');
  logger.info('Extension activating...');

  // Load configuration
  const config = Config.getInstance();
  logger.info(`Local port: ${config.localPort}`);
  logger.info(`Relay port: ${config.relayPort}`);
  logger.info(`mDNS enabled: ${config.enableMdns}`);

  // Create status bar item (must be before pairing service setup)
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(plug) NZR: Ready';
  statusBarItem.tooltip = 'NZR Dev Plugin - Click to show connected devices';
  statusBarItem.command = 'nzr-dev.showConnectedDevices';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Initialize editor service
  editorService.initialize();
  context.subscriptions.push({ dispose: () => editorService.dispose() });

  // Initialize WebSocket server (for direct local connections)
  wsServer.start();
  initializeHandlers(wsServer);

  // Update status bar on client connection/disconnection
  const updateStatusBar = () => {
    const wsClientCount = wsServer.getClientCount();
    const relayMobileCount = relayLite.getMobileDeviceCount();
    const totalCount = wsClientCount + relayMobileCount;

    if (totalCount > 0) {
      const wsClients = wsServer.getConnectedClients();
      const relayDevices = relayLite.getConnectedDevices().filter(d => d.deviceType === 'mobile');
      const allNames = [
        ...wsClients.map(c => c.deviceName),
        ...relayDevices.map(d => d.deviceName),
      ];
      statusBarItem.text = `$(plug) NZR: ${allNames.join(', ')}`;
      statusBarItem.tooltip = `NZR Dev - ${totalCount} device(s) connected`;
    } else {
      statusBarItem.text = '$(plug) NZR: Ready';
      statusBarItem.tooltip = 'NZR Dev Plugin - Click to show connected devices';
    }
  };

  wsServer.on('clientConnected', updateStatusBar);
  wsServer.on('clientDisconnected', updateStatusBar);
  relayLite.on('deviceConnected', updateStatusBar);
  relayLite.on('deviceDisconnected', updateStatusBar);

  // Initialize mDNS discovery
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder && config.enableMdns) {
    const workspaceId = workspaceFolder.uri.toString();
    discovery.publishService(workspaceId, workspaceFolder.name);
  }

  // Create tunnel status bar item
  const tunnelStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  tunnelStatusBarItem.text = '$(globe) Tunnel: Off';
  tunnelStatusBarItem.tooltip = 'Internet Tunnel - Click to toggle';
  tunnelStatusBarItem.command = 'nzr-dev.toggleTunnel';
  tunnelStatusBarItem.show();
  context.subscriptions.push(tunnelStatusBarItem);

  // Update tunnel status bar
  const updateTunnelStatus = (state: TunnelState) => {
    switch (state) {
      case 'connected':
        tunnelStatusBarItem.text = '$(globe) Tunnel: On';
        tunnelStatusBarItem.tooltip = `Internet Tunnel - ${tunnelService.url}`;
        break;
      case 'connecting':
        tunnelStatusBarItem.text = '$(sync~spin) Tunnel: ...';
        tunnelStatusBarItem.tooltip = 'Internet Tunnel - Connecting...';
        break;
      case 'error':
        tunnelStatusBarItem.text = '$(globe) Tunnel: Error';
        tunnelStatusBarItem.tooltip = 'Internet Tunnel - Connection error';
        break;
      default:
        tunnelStatusBarItem.text = '$(globe) Tunnel: Off';
        tunnelStatusBarItem.tooltip = 'Internet Tunnel - Click to enable';
    }
  };

  tunnelService.on('stateChange', updateTunnelStatus);

  // Start relay lite server (for tunnel connections)
  relayLite.start(config.relayPort).then((port) => {
    logger.info(`Relay Lite started on port ${port}`);

    // Handle commands from relay (mobile devices connecting via tunnel)
    relayLite.on('command', async (device, command: Command) => {
      logger.debug(`Processing relay command from ${device.deviceName}: ${command.category}:${command.action}`);

      // Create a virtual client for relay commands
      const relayVirtualClient: ConnectedClient = {
        id: device.socketId,
        ws: null as any,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        workspaceId: device.workspaceId,
        connectedAt: device.connectedAt,
        lastActivity: device.lastActivity,
      };

      await processCommand(relayVirtualClient, command, {
        sendResponse: (_client: ConnectedClient, commandId: string, data: unknown) => {
          // Response will be forwarded through relay
          const io = relayLite.getIO();
          if (io) {
            io.of('/device').to(`workspace:${device.workspaceId}`).emit('response', {
              type: 'response',
              id: `resp_${Date.now()}`,
              timestamp: Date.now(),
              commandId,
              success: true,
              data,
            });
          }
        },
        sendError: (_client: ConnectedClient, code: string, message: string, commandId?: string) => {
          const io = relayLite.getIO();
          if (io) {
            io.of('/device').to(`workspace:${device.workspaceId}`).emit('error', {
              type: 'error',
              id: `err_${Date.now()}`,
              timestamp: Date.now(),
              commandId: commandId || '',
              code,
              message,
            });
          }
        },
      } as any);
    });

    // Auto-start tunnel if configured
    if (config.autoStartTunnel) {
      logger.info('Auto-starting tunnel...');
      tunnelService.connect(port).then((url) => {
        logger.info(`Tunnel connected: ${url}`);
        vscode.window.showInformationMessage(`NZR Dev: Tunnel active at ${url}`);
      }).catch((error) => {
        logger.warn(`Failed to auto-start tunnel: ${error}`);
      });
    }
  }).catch((error) => {
    logger.error('Failed to start Relay Lite', error);
  });

  // Initialize pairing service
  const pairingService = PairingService.getInstance();
  pairingService.setOnPairingComplete((result: PairingResult) => {
    if (result.success) {
      vscode.window.showInformationMessage(
        `NZR Dev: Successfully paired with ${result.deviceName}`
      );
      updateStatusBar();
    } else {
      vscode.window.showErrorMessage(
        `NZR Dev: Pairing failed - ${result.error}`
      );
    }
  });

  // Register commands
  const generatePairingCodeCommand = vscode.commands.registerCommand(
    'nzr-dev.generatePairingCode',
    async () => {
      logger.info('Generate pairing code command executed');
      try {
        await QRCodePanel.createOrShow(context.extensionUri);
      } catch (error) {
        logger.error('Failed to show pairing panel', error as Error);
        vscode.window.showErrorMessage('NZR Dev: Failed to generate pairing code');
      }
    }
  );

  const showConnectedDevicesCommand = vscode.commands.registerCommand(
    'nzr-dev.showConnectedDevices',
    async () => {
      logger.info('Show connected devices command executed');

      const wsClients = wsServer.getConnectedClients();
      const relayDevices = relayLite.getConnectedDevices().filter(d => d.deviceType === 'mobile');

      if (wsClients.length === 0 && relayDevices.length === 0) {
        vscode.window.showInformationMessage('NZR Dev: No devices connected');
        return;
      }

      const items = [
        ...wsClients.map(c => ({
          label: `$(plug) ${c.deviceName}`,
          description: `Local - Connected ${c.connectedAt.toLocaleTimeString()}`,
          detail: `Device ID: ${c.deviceId}`,
        })),
        ...relayDevices.map(d => ({
          label: `$(globe) ${d.deviceName}`,
          description: `Tunnel - Connected ${d.connectedAt.toLocaleTimeString()}`,
          detail: `Device ID: ${d.deviceId}`,
        })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Connected devices',
        title: 'NZR Dev - Connected Devices',
      });

      if (selected) {
        vscode.window.showInformationMessage(`Device: ${selected.label}`);
      }
    }
  );

  const disconnectAllCommand = vscode.commands.registerCommand(
    'nzr-dev.disconnectAll',
    async () => {
      logger.info('Disconnect all command executed');
      const wsClientCount = wsServer.getClientCount();
      const relayDeviceCount = relayLite.getConnectedDeviceCount();

      if (wsClientCount === 0 && relayDeviceCount === 0) {
        vscode.window.showInformationMessage('NZR Dev: No devices connected');
        return;
      }

      // Restart WebSocket server to disconnect local clients
      wsServer.stop();
      wsServer.start();
      initializeHandlers(wsServer);

      // Restart Relay Lite to disconnect tunnel clients
      await relayLite.stop();
      await relayLite.start(config.relayPort);

      vscode.window.showInformationMessage(
        `NZR Dev: Disconnected ${wsClientCount + relayDeviceCount} device(s)`
      );
    }
  );

  const toggleTunnelCommand = vscode.commands.registerCommand(
    'nzr-dev.toggleTunnel',
    async () => {
      logger.info('Toggle tunnel command executed');

      if (tunnelService.isConnected()) {
        await tunnelService.disconnect();
        vscode.window.showInformationMessage('NZR Dev: Tunnel disconnected');
      } else {
        try {
          const port = relayLite.getPort();
          if (port === 0) {
            vscode.window.showWarningMessage('NZR Dev: Relay server not running');
            return;
          }

          vscode.window.showInformationMessage('NZR Dev: Starting tunnel...');
          const url = await tunnelService.connect(port);
          vscode.window.showInformationMessage(`NZR Dev: Tunnel active at ${url}`);

          // Regenerate QR code to include tunnel URL
          if (QRCodePanel.currentPanel) {
            await QRCodePanel.createOrShow(context.extensionUri);
          }
        } catch (error) {
          logger.error('Failed to start tunnel', error as Error);
          vscode.window.showErrorMessage('NZR Dev: Failed to start tunnel');
        }
      }
    }
  );

  const showConfigurationCommand = vscode.commands.registerCommand(
    'nzr-dev.showConfiguration',
    async () => {
      logger.info('Show configuration command executed');

      const localIp = discovery.getPrimaryAddress() || 'localhost';
      const wsClients = wsServer.getConnectedClients();
      const relayDevices = relayLite.getConnectedDevices();

      const configItems = [
        {
          label: '$(plug) Local WebSocket Server',
          description: `ws://${localIp}:${config.localPort}`,
          detail: `Port: ${config.localPort} | Status: Running | Clients: ${wsClients.length}`,
        },
        {
          label: '$(server) Relay Lite Server',
          description: `Port ${relayLite.getPort()}`,
          detail: `Status: ${relayLite.getIsRunning() ? 'Running' : 'Stopped'} | Devices: ${relayDevices.length}`,
        },
        {
          label: '$(globe) Internet Tunnel',
          description: tunnelService.url || 'Not active',
          detail: `Status: ${tunnelService.state} | Auto-start: ${config.autoStartTunnel ? 'Yes' : 'No'}`,
        },
        {
          label: '$(broadcast) mDNS Discovery',
          description: config.enableMdns ? 'Enabled' : 'Disabled',
          detail: workspaceFolder ? `Workspace: ${workspaceFolder.name}` : 'No workspace',
        },
        {
          label: '$(device-mobile) Connected Devices',
          description: `${wsClients.length + relayDevices.filter(d => d.deviceType === 'mobile').length} device(s)`,
          detail: `Local: ${wsClients.length} | Tunnel: ${relayDevices.filter(d => d.deviceType === 'mobile').length}`,
        },
        {
          label: '$(clock) Token Expiration',
          description: `${config.tokenExpirationSeconds} seconds`,
          detail: `Session timeout: ${config.sessionTimeoutHours} hours`,
        },
        {
          label: '$(file) Max File Size',
          description: `${(config.maxFileSize / 1024 / 1024).toFixed(1)} MB`,
          detail: 'Maximum file size for read operations',
        },
      ];

      const selected = await vscode.window.showQuickPick(configItems, {
        title: 'NZR Dev Configuration',
        placeHolder: 'Current extension configuration',
      });

      if (selected) {
        // Allow user to copy values
        const value = selected.description || '';
        const action = await vscode.window.showInformationMessage(
          `${selected.label}: ${value}`,
          'Copy Value',
          'Open Settings'
        );

        if (action === 'Copy Value') {
          await vscode.env.clipboard.writeText(value);
          vscode.window.showInformationMessage('Value copied to clipboard');
        } else if (action === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'nzr-dev');
        }
      }
    }
  );

  // Add commands to subscriptions
  context.subscriptions.push(
    generatePairingCodeCommand,
    showConnectedDevicesCommand,
    disconnectAllCommand,
    toggleTunnelCommand,
    showConfigurationCommand
  );

  logger.info('Extension activated successfully');
}

/**
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  logger?.info('Extension deactivating...');

  // Cancel all active pairing sessions
  const pairingService = PairingService.getInstance();
  pairingService.cancelAllSessions();

  // Stop WebSocket server
  wsServer.stop();

  // Disconnect tunnel
  await tunnelService.disconnect();

  // Stop Relay Lite server
  await relayLite.stop();

  // Stop mDNS discovery
  discovery.destroy();

  // Stop editor service
  editorService.dispose();

  logger?.info('Extension deactivated');
}
