import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { storage, STORAGE_KEYS } from '../services/storage';
import { socketService } from '../services/socket';

/**
 * Connection state for a VSCode instance
 */
export interface VSCodeConnection {
  id: string;
  name: string;
  workspaceName?: string;
  workspaceId?: string;
  type?: 'local' | 'relay';
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  localAddress?: string;
  relayUrl?: string;
  lastConnected?: Date;
}

/**
 * Pairing state
 */
export interface PairingState {
  isPairing: boolean;
  token?: string;
  workspaceId?: string;
  error?: string;
}

/**
 * Connection context value
 */
interface ConnectionContextValue {
  /** List of known connections */
  connections: VSCodeConnection[];
  /** Currently active connection */
  activeConnection: VSCodeConnection | null;
  /** Pairing state */
  pairing: PairingState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Device ID for this mobile device */
  deviceId: string | null;
  /** Add a new connection */
  addConnection: (connection: VSCodeConnection) => void;
  /** Remove a connection */
  removeConnection: (id: string) => void;
  /** Set active connection */
  setActiveConnection: (id: string | null) => void;
  /** Update connection status */
  updateConnectionStatus: (id: string, status: VSCodeConnection['status']) => void;
  /** Start pairing process */
  startPairing: (token: string, workspaceId: string) => void;
  /** Complete pairing */
  completePairing: (connection: VSCodeConnection) => void;
  /** Cancel pairing */
  cancelPairing: () => void;
  /** Set pairing error */
  setPairingError: (error: string) => void;
  /** Initialize device ID */
  initializeDeviceId: () => Promise<string>;
  /** Disconnect from current connection */
  disconnect: () => void;
  /** Clear all data (connections, tokens) */
  clearAllData: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/**
 * Hook to use connection context
 */
export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Connection provider component
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<VSCodeConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingState>({ isPairing: false });
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Load saved connections on mount
  useEffect(() => {
    loadConnections();
    initializeDeviceId();
  }, []);

  // Save connections when they change
  useEffect(() => {
    if (connections.length > 0) {
      storage.setJson(STORAGE_KEYS.CONNECTIONS, connections);
    }
  }, [connections]);

  const loadConnections = async () => {
    const saved = await storage.getJson<VSCodeConnection[]>(STORAGE_KEYS.CONNECTIONS);
    if (saved) {
      // Mark all as disconnected on app start
      setConnections(saved.map(c => ({ ...c, status: 'disconnected' as const })));
    }
  };

  const initializeDeviceId = useCallback(async (): Promise<string> => {
    let id = await storage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = generateUUID();
      await storage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    setDeviceId(id);
    return id;
  }, []);

  const addConnection = useCallback((connection: VSCodeConnection) => {
    setConnections(prev => {
      const exists = prev.find(c => c.id === connection.id);
      if (exists) {
        return prev.map(c => c.id === connection.id ? connection : c);
      }
      return [...prev, connection];
    });
  }, []);

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
    }
  }, [activeConnectionId]);

  const setActiveConnection = useCallback((id: string | null) => {
    setActiveConnectionId(id);
  }, []);

  const updateConnectionStatus = useCallback((id: string, status: VSCodeConnection['status']) => {
    setConnections(prev => prev.map(c =>
      c.id === id ? { ...c, status, lastConnected: status === 'connected' ? new Date() : c.lastConnected } : c
    ));
  }, []);

  const startPairing = useCallback((token: string, workspaceId: string) => {
    setPairing({ isPairing: true, token, workspaceId });
  }, []);

  const completePairing = useCallback((connection: VSCodeConnection) => {
    addConnection(connection);
    setActiveConnectionId(connection.id);
    setPairing({ isPairing: false });
  }, [addConnection]);

  const cancelPairing = useCallback(() => {
    setPairing({ isPairing: false });
  }, []);

  const setPairingError = useCallback((error: string) => {
    setPairing(prev => ({ ...prev, error }));
  }, []);

  const disconnect = useCallback(() => {
    socketService.disconnect();
    if (activeConnectionId) {
      setConnections(prev => prev.map(c =>
        c.id === activeConnectionId ? { ...c, status: 'disconnected' as const } : c
      ));
    }
    setActiveConnectionId(null);
  }, [activeConnectionId]);

  const clearAllData = useCallback(async () => {
    // Disconnect first
    socketService.disconnect();
    setActiveConnectionId(null);
    // Clear connections
    setConnections([]);
    await storage.removeItem(STORAGE_KEYS.CONNECTIONS);
    // Note: tokens are cleared separately via authService.clearTokens()
  }, []);

  const activeConnection = connections.find(c => c.id === activeConnectionId) || null;
  const isConnected = activeConnection?.status === 'connected';

  return (
    <ConnectionContext.Provider
      value={{
        connections,
        activeConnection,
        pairing,
        isConnected,
        deviceId,
        addConnection,
        removeConnection,
        setActiveConnection,
        updateConnectionStatus,
        startPairing,
        completePairing,
        cancelPairing,
        setPairingError,
        initializeDeviceId,
        disconnect,
        clearAllData,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}
