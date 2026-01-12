import Bonjour, { Service, Browser } from 'bonjour-service';
import * as os from 'os';
import { Logger } from './logger';
import { Config } from './config';

/**
 * Published service information
 */
export interface PublishedService {
  name: string;
  type: string;
  port: number;
  host: string;
  txt: Record<string, string>;
}

/**
 * Discovered service information
 */
export interface DiscoveredService {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  workspaceId: string;
  workspaceName: string;
}

/**
 * mDNS discovery service using Bonjour
 */
export class DiscoveryService {
  private static instance: DiscoveryService;
  private bonjour: Bonjour | null = null;
  private publishedService: Service | null = null;
  private browser: Browser | null = null;
  private discoveredServices: Map<string, DiscoveredService> = new Map();
  private logger: Logger;
  private config: Config;

  private readonly SERVICE_TYPE = 'nzr-dev';
  private readonly SERVICE_PROTOCOL = 'tcp';

  private constructor() {
    this.logger = new Logger('NZR Discovery');
    this.config = Config.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService();
    }
    return DiscoveryService.instance;
  }

  /**
   * Initialize Bonjour instance
   */
  private initBonjour(): void {
    if (!this.bonjour) {
      this.bonjour = new Bonjour();
    }
  }

  /**
   * Publish service on local network
   */
  publishService(workspaceId: string, workspaceName: string): void {
    if (!this.config.enableMdns) {
      this.logger.info('mDNS disabled in configuration');
      return;
    }

    this.initBonjour();

    if (this.publishedService) {
      this.logger.warn('Service already published, unpublishing first');
      this.unpublishService();
    }

    const hostname = os.hostname();
    const serviceName = `NZR-${workspaceName.replace(/[^a-zA-Z0-9]/g, '-')}-${hostname}`;

    try {
      this.publishedService = this.bonjour!.publish({
        name: serviceName,
        type: this.SERVICE_TYPE,
        protocol: this.SERVICE_PROTOCOL,
        port: this.config.localPort,
        txt: {
          workspaceId,
          workspaceName,
          version: '1',
        },
      });

      this.logger.info(`Published mDNS service: ${serviceName} on port ${this.config.localPort}`);
    } catch (error) {
      this.logger.error('Failed to publish mDNS service', error as Error);
    }
  }

  /**
   * Unpublish service
   */
  unpublishService(): void {
    const service = this.publishedService;
    if (service && typeof service.stop === 'function') {
      try {
        service.stop();
        this.publishedService = null;
        this.logger.info('Unpublished mDNS service');
      } catch (error) {
        this.logger.error('Failed to unpublish mDNS service', error as Error);
      }
    }
  }

  /**
   * Start browsing for services
   */
  startBrowsing(onServiceFound?: (service: DiscoveredService) => void): void {
    this.initBonjour();

    if (this.browser) {
      this.logger.warn('Browser already active');
      return;
    }

    this.browser = this.bonjour!.find({
      type: this.SERVICE_TYPE,
      protocol: this.SERVICE_PROTOCOL,
    });

    this.browser.on('up', (service: Service) => {
      const discovered = this.parseService(service);
      if (discovered) {
        this.discoveredServices.set(discovered.workspaceId, discovered);
        this.logger.info(`Discovered service: ${discovered.workspaceName} at ${discovered.host}:${discovered.port}`);
        onServiceFound?.(discovered);
      }
    });

    this.browser.on('down', (service: Service) => {
      const txt = service.txt as Record<string, string> | undefined;
      const workspaceId = txt?.workspaceId;
      if (workspaceId) {
        this.discoveredServices.delete(workspaceId);
        this.logger.info(`Service went down: ${service.name}`);
      }
    });

    this.logger.info('Started browsing for NZR services');
  }

  /**
   * Stop browsing for services
   */
  stopBrowsing(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
      this.logger.info('Stopped browsing for services');
    }
  }

  /**
   * Parse Bonjour service to DiscoveredService
   */
  private parseService(service: Service): DiscoveredService | null {
    const txt = service.txt as Record<string, string> | undefined;
    if (!txt?.workspaceId || !txt?.workspaceName) {
      return null;
    }

    return {
      name: service.name,
      host: service.host,
      port: service.port,
      addresses: service.addresses || [],
      workspaceId: txt.workspaceId,
      workspaceName: txt.workspaceName,
    };
  }

  /**
   * Get all discovered services
   */
  getDiscoveredServices(): DiscoveredService[] {
    return Array.from(this.discoveredServices.values());
  }

  /**
   * Get local IP addresses
   */
  getLocalAddresses(): string[] {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const iface of Object.values(interfaces)) {
      if (!iface) continue;
      for (const addr of iface) {
        // Skip internal and non-IPv4 addresses
        if (addr.internal || addr.family !== 'IPv4') continue;
        addresses.push(addr.address);
      }
    }

    return addresses;
  }

  /**
   * Get primary local address
   */
  getPrimaryAddress(): string | null {
    const addresses = this.getLocalAddresses();
    return addresses.length > 0 ? addresses[0] : null;
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.unpublishService();
    this.stopBrowsing();
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.discoveredServices.clear();
    this.logger.info('Discovery service destroyed');
  }
}

export const discovery = DiscoveryService.getInstance();
