import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Alert,
  Platform,
} from 'react-native';
import {
  Switch,
  List,
  Divider,
  Button,
  ActivityIndicator,
} from 'react-native-paper';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useConnection } from '../contexts/ConnectionContext';
import { authService } from '../services/auth';

/**
 * Notification settings
 */
interface NotificationSettings {
  enabled: boolean;
  errors: boolean;
  warnings: boolean;
  buildComplete: boolean;
  connectionLost: boolean;
}

/**
 * Settings screen with notification preferences
 */
export default function SettingsScreen() {
  const { isConnected, deviceId, disconnect, clearAllData } = useConnection();
  const [loading, setLoading] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    errors: true,
    warnings: false,
    buildComplete: true,
    connectionLost: true,
  });

  // Request notification permissions and get push token
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Register for push notifications
  const registerForPushNotifications = async () => {
    try {
      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return;
      }

      // Check current permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permissions not granted');
        return;
      }

      // Get Expo push token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-expo-project-id', // Replace with your actual project ID
      });

      setPushToken(token.data);
      setSettings((prev) => ({ ...prev, enabled: true }));

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'NZR Notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#007ACC',
        });
      }

      console.log('Push token:', token.data);
    } catch (error) {
      console.error('Failed to register for push notifications:', error);
    }
  };

  // Toggle notification setting
  const toggleSetting = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Register push token with server
  const registerToken = async () => {
    if (!pushToken || !deviceId) {
      Alert.alert('Error', 'No push token or device ID available');
      return;
    }

    setLoading(true);
    try {
      await authService.registerPushToken(deviceId, pushToken);
      Alert.alert('Success', 'Push notifications registered');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to register: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from VSCode?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect(),
        },
      ]
    );
  };

  // Handle clear data
  const handleClearData = () => {
    Alert.alert(
      'Clear Data',
      'This will remove all saved connections and tokens. You will need to pair again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.clearTokens();
              await clearAllData();
              Alert.alert('Success', 'All data cleared');
            } catch (error) {
              console.error('Failed to clear data:', error);
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Connection Section */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Connection</List.Subheader>
        <List.Item
          title="Connection Status"
          description={isConnected ? 'Connected to VSCode' : 'Not connected'}
          left={(props) => (
            <List.Icon
              {...props}
              icon={isConnected ? 'check-circle' : 'alert-circle'}
              color={isConnected ? '#6A9955' : '#F44747'}
            />
          )}
        />
        {deviceId && (
          <List.Item
            title="Device ID"
            description={deviceId.substring(0, 20) + '...'}
            left={(props) => <List.Icon {...props} icon="identifier" />}
          />
        )}
        {isConnected && (
          <List.Item
            title="Disconnect"
            description="Disconnect from current workspace"
            left={(props) => (
              <List.Icon {...props} icon="link-off" color="#F44747" />
            )}
            onPress={handleDisconnect}
          />
        )}
      </List.Section>

      <Divider style={styles.divider} />

      {/* Notifications Section */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Notifications</List.Subheader>

        <List.Item
          title="Push Notifications"
          description={
            settings.enabled
              ? 'Enabled'
              : 'Tap to enable push notifications'
          }
          left={(props) => <List.Icon {...props} icon="bell" />}
          right={() => (
            <Switch
              value={settings.enabled}
              onValueChange={() => {
                if (!settings.enabled) {
                  registerForPushNotifications();
                } else {
                  toggleSetting('enabled');
                }
              }}
              color="#007ACC"
            />
          )}
        />

        {settings.enabled && (
          <>
            <List.Item
              title="Error Notifications"
              description="Get notified about build errors"
              left={(props) => (
                <List.Icon {...props} icon="alert-circle" color="#F44747" />
              )}
              right={() => (
                <Switch
                  value={settings.errors}
                  onValueChange={() => toggleSetting('errors')}
                  color="#007ACC"
                />
              )}
            />

            <List.Item
              title="Warning Notifications"
              description="Get notified about warnings"
              left={(props) => (
                <List.Icon {...props} icon="alert" color="#CCA700" />
              )}
              right={() => (
                <Switch
                  value={settings.warnings}
                  onValueChange={() => toggleSetting('warnings')}
                  color="#007ACC"
                />
              )}
            />

            <List.Item
              title="Build Complete"
              description="Notify when builds finish"
              left={(props) => (
                <List.Icon {...props} icon="check-circle" color="#6A9955" />
              )}
              right={() => (
                <Switch
                  value={settings.buildComplete}
                  onValueChange={() => toggleSetting('buildComplete')}
                  color="#007ACC"
                />
              )}
            />

            <List.Item
              title="Connection Lost"
              description="Notify when connection is lost"
              left={(props) => (
                <List.Icon {...props} icon="wifi-off" color="#8B8B8B" />
              )}
              right={() => (
                <Switch
                  value={settings.connectionLost}
                  onValueChange={() => toggleSetting('connectionLost')}
                  color="#007ACC"
                />
              )}
            />

            {pushToken && (
              <View style={styles.buttonContainer}>
                <Button
                  mode="contained"
                  onPress={registerToken}
                  loading={loading}
                  disabled={loading}
                  style={styles.registerButton}
                >
                  Register Notifications
                </Button>
              </View>
            )}
          </>
        )}
      </List.Section>

      <Divider style={styles.divider} />

      {/* About Section */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>About</List.Subheader>
        <List.Item
          title="Version"
          description="1.0.0"
          left={(props) => <List.Icon {...props} icon="information" />}
        />
        <List.Item
          title="Clear All Data"
          description="Remove saved connections and tokens"
          left={(props) => (
            <List.Icon {...props} icon="delete" color="#F44747" />
          )}
          onPress={handleClearData}
        />
      </List.Section>

      {/* Push Token Debug */}
      {__DEV__ && pushToken && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Debug: Push Token</Text>
          <Text style={styles.debugText} selectable>
            {pushToken}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  sectionHeader: {
    color: '#007ACC',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    backgroundColor: '#3C3C3C',
    marginVertical: 8,
  },
  buttonContainer: {
    padding: 16,
  },
  registerButton: {
    backgroundColor: '#007ACC',
  },
  debugContainer: {
    padding: 16,
    margin: 16,
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
  },
  debugTitle: {
    color: '#8B8B8B',
    fontSize: 12,
    marginBottom: 8,
  },
  debugText: {
    color: '#CCCCCC',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
