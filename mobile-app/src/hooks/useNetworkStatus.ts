import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

/**
 * Network status information
 */
export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  isWifi: boolean;
  isCellular: boolean;
  details: {
    strength?: number;
    cellularGeneration?: string;
    carrier?: string;
  };
}

/**
 * Hook for monitoring network connectivity status
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
    isWifi: false,
    isCellular: false,
    details: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  const parseNetInfoState = useCallback((state: NetInfoState): NetworkStatus => {
    const details: NetworkStatus['details'] = {};

    if (state.type === 'wifi' && state.details) {
      details.strength = (state.details as any).strength;
    } else if (state.type === 'cellular' && state.details) {
      details.cellularGeneration = (state.details as any).cellularGeneration;
      details.carrier = (state.details as any).carrier;
    }

    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      isWifi: state.type === 'wifi',
      isCellular: state.type === 'cellular',
      details,
    };
  }, []);

  useEffect(() => {
    let subscription: NetInfoSubscription;

    // Get initial state
    NetInfo.fetch().then((state) => {
      setStatus(parseNetInfoState(state));
      setIsLoading(false);
    });

    // Subscribe to network state changes
    subscription = NetInfo.addEventListener((state) => {
      setStatus(parseNetInfoState(state));
    });

    return () => {
      subscription?.();
    };
  }, [parseNetInfoState]);

  // Refresh network status manually
  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    setStatus(parseNetInfoState(state));
    return parseNetInfoState(state);
  }, [parseNetInfoState]);

  return {
    ...status,
    isLoading,
    refresh,
  };
}

export default useNetworkStatus;
