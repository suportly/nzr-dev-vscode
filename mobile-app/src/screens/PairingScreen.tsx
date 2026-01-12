import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  ActivityIndicator,
  Surface,
  IconButton,
} from 'react-native-paper';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { authService, QRCodePayload } from '../services/auth';
import { socketService } from '../services/socket';
import { useConnection } from '../contexts/ConnectionContext';
import type { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Pairing'>;

/**
 * Pairing screen for connecting to VSCode via QR code or PIN
 */
export default function PairingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { completePairing, pairing } = useConnection();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get device info for pairing
  const getDeviceInfo = () => ({
    name: Device.deviceName || `${Platform.OS} Device`,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || '1.0.0',
  });

  // Handle QR code scan
  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned || isLoading) return;

    setScanned(true);
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Pairing] QR code scanned, parsing...');
      const payload = authService.parseQRCode(result.data);

      if (!payload) {
        throw new Error('Invalid QR code. Please scan a valid pairing code from VSCode.');
      }

      console.log('[Pairing] Payload parsed:', {
        workspace: payload.n,
        localAddress: payload.l,
        hasRelay: !!payload.r,
      });

      const deviceInfo = getDeviceInfo();
      console.log('[Pairing] Device info:', deviceInfo);

      // Try local connection first if available (works when on same network)
      if (payload.l) {
        console.log('[Pairing] Attempting local connection first...');

        try {
          // Store the token for authentication
          await authService.storeTokens({
            accessToken: payload.t,
            refreshToken: payload.t, // Use same token for local
          });

          // Connect to WebSocket server with device name
          console.log('[Pairing] Connecting to WebSocket:', payload.l);
          await socketService.connect(payload.l, payload.t, deviceInfo.name);
          console.log('[Pairing] Local WebSocket connected!');

          // Local connection succeeded - store connection info
          completePairing({
            id: payload.w,
            name: payload.n,
            localAddress: payload.l,
            relayUrl: payload.r, // Store relay URL for future reconnects
            status: 'connected',
            lastConnected: new Date(),
          });

          // Navigate to home
          navigation.navigate('Main');
          return;
        } catch (localError) {
          console.log('[Pairing] Local connection failed:', localError);
          // If relay is available, try it as fallback
          if (!payload.r) {
            throw localError; // No relay, propagate the error
          }
          console.log('[Pairing] Falling back to relay server...');
        }
      }

      // Use relay server if local connection failed or not available
      if (payload.r) {
        console.log('[Pairing] Using relay server:', payload.r);
        authService.setRelayUrl(payload.r);

        // Complete pairing via relay
        const pairingResult = await authService.completePairingWithToken(
          payload.t,
          deviceInfo
        );

        // Update connection context
        completePairing({
          id: pairingResult.workspace.id,
          name: pairingResult.workspace.name,
          localAddress: pairingResult.workspace.localAddress,
          relayUrl: pairingResult.workspace.relayUrl,
          status: 'connected',
          lastConnected: new Date(),
        });

        // Navigate back to home
        navigation.navigate('Main');
        return;
      }

      throw new Error('No connection method available in QR code');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pair';
      setError(message);
      Alert.alert('Pairing Failed', message);
    } finally {
      setIsLoading(false);
      // Reset scanned after delay to allow retry
      setTimeout(() => setScanned(false), 2000);
    }
  };

  // Handle PIN submission
  const handlePinSubmit = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setIsLoading(true);
    setError(null);
    Keyboard.dismiss();

    try {
      const pairingResult = await authService.completePairingWithPin(
        pin,
        getDeviceInfo()
      );

      // Update connection context
      completePairing({
        id: pairingResult.workspace.id,
        name: pairingResult.workspace.name,
        localAddress: pairingResult.workspace.localAddress,
        relayUrl: pairingResult.workspace.relayUrl,
        status: 'connected',
        lastConnected: new Date(),
      });

      // Navigate back to home
      navigation.navigate('Main');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pair with PIN';
      setError(message);
      Alert.alert('Pairing Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007ACC" />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    );
  }

  // PIN entry mode
  if (showPinEntry) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Surface style={styles.pinContainer}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={() => setShowPinEntry(false)}
            style={styles.backButton}
          />
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit PIN shown in VSCode
          </Text>

          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(text) => {
              setPin(text.replace(/[^0-9]/g, '').slice(0, 6));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor="#666"
            autoFocus
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            mode="contained"
            onPress={handlePinSubmit}
            disabled={pin.length !== 6}
            style={styles.submitButton}
          >
            Connect
          </Button>
        </Surface>
      </KeyboardAvoidingView>
    );
  }

  // Camera permission not granted
  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Surface style={styles.permissionContainer}>
          <Text style={styles.title}>Camera Permission Required</Text>
          <Text style={styles.subtitle}>
            We need camera access to scan the QR code from VSCode
          </Text>
          <Button mode="contained" onPress={requestPermission} style={styles.button}>
            Grant Permission
          </Button>
          <Button
            mode="outlined"
            onPress={() => setShowPinEntry(true)}
            style={styles.button}
          >
            Enter PIN Instead
          </Button>
        </Surface>
      </View>
    );
  }

  // QR Scanner
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.scanText}>
            Scan the QR code shown in VSCode
          </Text>

          {error && (
            <Text style={styles.errorTextOverlay}>{error}</Text>
          )}
        </View>
      </CameraView>

      <View style={styles.bottomActions}>
        <Button
          mode="outlined"
          onPress={() => setShowPinEntry(true)}
          textColor="#FFFFFF"
          style={styles.pinButton}
        >
          Enter PIN Instead
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#007ACC',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  errorTextOverlay: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pinButton: {
    borderColor: '#FFFFFF',
  },
  loadingText: {
    color: '#CCCCCC',
    marginTop: 16,
    fontSize: 16,
  },
  permissionContainer: {
    padding: 24,
    margin: 24,
    borderRadius: 12,
    backgroundColor: '#252526',
    alignItems: 'center',
  },
  pinContainer: {
    padding: 24,
    margin: 24,
    borderRadius: 12,
    backgroundColor: '#252526',
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  backButton: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
  },
  subtitle: {
    color: '#8B8B8B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    marginTop: 16,
    width: '100%',
  },
  pinInput: {
    width: '100%',
    fontSize: 32,
    textAlign: 'center',
    letterSpacing: 8,
    backgroundColor: '#1E1E1E',
    color: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginBottom: 16,
  },
  submitButton: {
    width: '100%',
    marginTop: 8,
  },
});
