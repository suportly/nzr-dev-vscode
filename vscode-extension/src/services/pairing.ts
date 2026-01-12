import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import {
  generatePairingToken,
  createQRCodePayload,
  PairingTokenData,
  QRCodePayload,
  verifyTokenHash,
} from '../utils/auth';
import { generateQRCodeDataUrl, createQRCodeHtml } from '../utils/qrcode';
import { Config } from '../utils/config';
import { Logger } from '../utils/logger';
import { discovery } from '../utils/discovery';
import { tunnelService } from './tunnel';

/**
 * Active pairing session data
 */
export interface PairingSession {
  id: string;
  tokenData: PairingTokenData;
  qrPayload: QRCodePayload;
  createdAt: Date;
  expirationTimer?: NodeJS.Timeout;
}

/**
 * Pairing result
 */
export interface PairingResult {
  success: boolean;
  deviceId?: string;
  deviceName?: string;
  error?: string;
}

/**
 * Service for managing device pairing
 */
export class PairingService {
  private static instance: PairingService;
  private activeSessions: Map<string, PairingSession> = new Map();
  private logger: Logger;
  private config: Config;
  private onPairingComplete?: (result: PairingResult) => void;

  private constructor() {
    this.logger = new Logger('NZR Dev Pairing');
    this.config = Config.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PairingService {
    if (!PairingService.instance) {
      PairingService.instance = new PairingService();
    }
    return PairingService.instance;
  }

  /**
   * Set callback for pairing completion
   */
  setOnPairingComplete(callback: (result: PairingResult) => void): void {
    this.onPairingComplete = callback;
  }

  /**
   * Create a new pairing session
   */
  async createSession(): Promise<PairingSession> {
    // Get workspace info
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = workspaceFolder?.name || 'Untitled';
    const workspaceId = uuidv4();

    // Generate tokens
    const expirationMinutes = this.config.tokenExpirationSeconds / 60;
    const tokenData = generatePairingToken(workspaceId, expirationMinutes);

    // Get local address using real IP (localhost won't work from mobile device)
    const localIp = discovery.getPrimaryAddress() || 'localhost';
    const localAddress = `ws://${localIp}:${this.config.localPort}`;

    // Get tunnel URL if tunnel is connected (for internet access)
    const tunnelUrl = tunnelService.isConnected() ? tunnelService.url : undefined;

    // Create QR payload
    const qrPayload = createQRCodePayload(
      tokenData.token,
      workspaceId,
      workspaceName,
      localAddress,
      tunnelUrl || undefined,
      tokenData.expiresAt
    );

    // Create session
    const session: PairingSession = {
      id: uuidv4(),
      tokenData,
      qrPayload,
      createdAt: new Date(),
    };

    // Set expiration timer
    const timeUntilExpiry = tokenData.expiresAt.getTime() - Date.now();
    session.expirationTimer = setTimeout(() => {
      this.expireSession(session.id);
    }, timeUntilExpiry);

    // Store session
    this.activeSessions.set(session.id, session);
    this.logger.info(`Created pairing session ${session.id} for workspace ${workspaceName}`);

    return session;
  }

  /**
   * Get QR code HTML for a session
   */
  async getQRCodeHtml(sessionId: string): Promise<string | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found`);
      return null;
    }

    const dataUrl = await generateQRCodeDataUrl(session.qrPayload);
    const workspaceName = session.qrPayload.n;

    return createQRCodeHtml(
      dataUrl,
      session.tokenData.pin,
      workspaceName,
      session.tokenData.expiresAt
    );
  }

  /**
   * Validate a pairing token
   */
  validateToken(token: string): PairingSession | null {
    for (const [, session] of this.activeSessions) {
      if (verifyTokenHash(token, session.tokenData.tokenHash)) {
        // Check expiration
        if (new Date() > session.tokenData.expiresAt) {
          this.logger.warn(`Token for session ${session.id} has expired`);
          return null;
        }
        return session;
      }
    }
    return null;
  }

  /**
   * Validate a PIN code
   */
  validatePin(pin: string): PairingSession | null {
    for (const [, session] of this.activeSessions) {
      if (session.tokenData.pin === pin) {
        // Check expiration
        if (new Date() > session.tokenData.expiresAt) {
          this.logger.warn(`PIN for session ${session.id} has expired`);
          return null;
        }
        return session;
      }
    }
    return null;
  }

  /**
   * Complete a pairing session
   */
  completePairing(sessionId: string, deviceId: string, deviceName: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Cannot complete pairing: session ${sessionId} not found`);
      return;
    }

    // Clear expiration timer
    if (session.expirationTimer) {
      clearTimeout(session.expirationTimer);
    }

    // Remove session
    this.activeSessions.delete(sessionId);

    this.logger.info(`Pairing completed for session ${sessionId} with device ${deviceName}`);

    // Notify callback
    if (this.onPairingComplete) {
      this.onPairingComplete({
        success: true,
        deviceId,
        deviceName,
      });
    }
  }

  /**
   * Expire a session
   */
  private expireSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      if (session.expirationTimer) {
        clearTimeout(session.expirationTimer);
      }
      this.activeSessions.delete(sessionId);
      this.logger.info(`Session ${sessionId} expired`);
    }
  }

  /**
   * Cancel a session
   */
  cancelSession(sessionId: string): void {
    this.expireSession(sessionId);
  }

  /**
   * Cancel all active sessions
   */
  cancelAllSessions(): void {
    for (const [sessionId] of this.activeSessions) {
      this.expireSession(sessionId);
    }
    this.logger.info('All pairing sessions cancelled');
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Check if there are any active sessions
   */
  hasActiveSessions(): boolean {
    return this.activeSessions.size > 0;
  }
}
