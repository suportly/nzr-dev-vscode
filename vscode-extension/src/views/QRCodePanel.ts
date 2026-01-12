import * as vscode from 'vscode';
import { PairingService, PairingSession } from '../services/pairing';
import { Logger } from '../utils/logger';

/**
 * WebView panel for displaying QR code pairing interface
 */
export class QRCodePanel {
  public static currentPanel: QRCodePanel | undefined;
  private static readonly viewType = 'nzrDevQRCode';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private session: PairingSession | null = null;
  private logger: Logger;
  private pairingService: PairingService;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.logger = new Logger('NZR Dev QR Panel');
    this.pairingService = PairingService.getInstance();

    // Set up panel event handlers
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    // Listen for pairing completion
    this.pairingService.setOnPairingComplete(result => {
      if (result.success) {
        this.showSuccessMessage(result.deviceName || 'Device');
      }
    });
  }

  /**
   * Create or show the QR code panel
   */
  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.ViewColumn.Beside;

    // If panel exists, show it
    if (QRCodePanel.currentPanel) {
      QRCodePanel.currentPanel.panel.reveal(column);
      await QRCodePanel.currentPanel.refresh();
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      QRCodePanel.viewType,
      'NZR Dev - Connect',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    QRCodePanel.currentPanel = new QRCodePanel(panel, extensionUri);
    await QRCodePanel.currentPanel.initialize();
  }

  /**
   * Initialize the panel with a new pairing session
   */
  private async initialize(): Promise<void> {
    try {
      this.session = await this.pairingService.createSession();
      await this.updateContent();
      this.logger.info('QR Code panel initialized');
    } catch (error) {
      this.logger.error('Failed to initialize QR panel', error as Error);
      this.showError('Failed to generate pairing code');
    }
  }

  /**
   * Refresh the pairing session
   */
  private async refresh(): Promise<void> {
    if (this.session) {
      this.pairingService.cancelSession(this.session.id);
    }
    await this.initialize();
  }

  /**
   * Update the webview content
   */
  private async updateContent(): Promise<void> {
    if (!this.session) {
      this.panel.webview.html = this.getErrorHtml('No active pairing session');
      return;
    }

    const html = await this.pairingService.getQRCodeHtml(this.session.id);
    if (html) {
      this.panel.webview.html = html;
    } else {
      this.panel.webview.html = this.getErrorHtml('Failed to generate QR code');
    }
  }

  /**
   * Handle messages from the webview
   */
  private handleMessage(message: { command: string; data?: unknown }): void {
    switch (message.command) {
      case 'refresh':
        this.refresh();
        break;
      case 'cancel':
        this.dispose();
        break;
      default:
        this.logger.warn(`Unknown message command: ${message.command}`);
    }
  }

  /**
   * Show success message in panel and then close
   */
  private showSuccessMessage(deviceName: string): void {
    this.panel.webview.html = this.getSuccessHtml(deviceName);
    vscode.window.showInformationMessage(
      `NZR Dev: Successfully paired with ${deviceName}`
    );
    // Auto-close panel after 3 seconds
    setTimeout(() => {
      this.dispose();
    }, 3000);
  }

  /**
   * Get success HTML
   */
  private getSuccessHtml(deviceName: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #1E1E1E;
      color: #CCCCCC;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .success-icon {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      animation: scaleIn 0.5s ease-out;
    }
    .success-icon svg {
      width: 60px;
      height: 60px;
      fill: white;
    }
    .checkmark {
      stroke: white;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      animation: draw 0.6s ease-out 0.2s forwards;
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
    }
    @keyframes scaleIn {
      0% { transform: scale(0); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes draw {
      to { stroke-dashoffset: 0; }
    }
    h1 {
      color: #4CAF50;
      font-size: 28px;
      margin: 0 0 12px 0;
      animation: fadeIn 0.5s ease-out 0.3s both;
    }
    .device-name {
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      animation: fadeIn 0.5s ease-out 0.4s both;
    }
    .subtitle {
      color: #8B8B8B;
      font-size: 14px;
      animation: fadeIn 0.5s ease-out 0.5s both;
    }
    .closing-text {
      color: #666666;
      font-size: 12px;
      margin-top: 32px;
      animation: fadeIn 0.5s ease-out 0.6s both;
    }
    @keyframes fadeIn {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="success-icon">
    <svg viewBox="0 0 50 50">
      <polyline class="checkmark" points="15,26 22,33 35,18" />
    </svg>
  </div>
  <h1>Connected!</h1>
  <div class="device-name">${this.escapeHtml(deviceName)}</div>
  <div class="subtitle">Device paired successfully</div>
  <div class="closing-text">This panel will close automatically...</div>
</body>
</html>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Show error in panel
   */
  private showError(message: string): void {
    this.panel.webview.html = this.getErrorHtml(message);
  }

  /**
   * Get error HTML
   */
  private getErrorHtml(message: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #1E1E1E;
      color: #CCCCCC;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .error {
      color: #F48771;
      text-align: center;
    }
    button {
      margin-top: 20px;
      padding: 10px 20px;
      background: #007ACC;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #005A9E;
    }
  </style>
</head>
<body>
  <div class="error">
    <h2>Error</h2>
    <p>${message}</p>
    <button onclick="vscode.postMessage({ command: 'refresh' })">Try Again</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>
    `;
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    QRCodePanel.currentPanel = undefined;

    // Cancel active session
    if (this.session) {
      this.pairingService.cancelSession(this.session.id);
    }

    // Clean up
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }

    this.logger.info('QR Code panel disposed');
  }
}
