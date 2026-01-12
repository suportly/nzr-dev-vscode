import React, { useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import {
  Text,
  Surface,
  IconButton,
  FAB,
  Card,
  Chip,
  Menu,
  Divider,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnection, VSCodeConnection } from '../contexts/ConnectionContext';
import { socketService } from '../services/socket';
import { authService } from '../services/auth';
import type { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Connection card component
 */
const ConnectionCard: React.FC<{
  connection: VSCodeConnection;
  isActive: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}> = ({ connection, isActive, onConnect, onDisconnect, onRemove }) => {
  const [menuVisible, setMenuVisible] = React.useState(false);

  const getStatusColor = () => {
    switch (connection.status) {
      case 'connected':
        return '#4CAF50';
      case 'connecting':
        return '#FF9800';
      case 'error':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = () => {
    switch (connection.status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <Card style={[styles.card, isActive && styles.activeCard]} mode="elevated">
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <Text style={styles.connectionName}>{connection.name}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
              <Text style={styles.statusText}>{getStatusText()}</Text>
            </View>
            {connection.lastConnected && (
              <Text style={styles.lastConnected}>
                Last: {new Date(connection.lastConnected).toLocaleString()}
              </Text>
            )}
          </View>

          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={24}
                onPress={() => setMenuVisible(true)}
              />
            }
          >
            {connection.status === 'connected' ? (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onDisconnect();
                }}
                title="Disconnect"
                leadingIcon="connection"
              />
            ) : (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onConnect();
                }}
                title="Connect"
                leadingIcon="connection"
              />
            )}
            <Divider />
            <Menu.Item
              onPress={() => {
                setMenuVisible(false);
                onRemove();
              }}
              title="Remove"
              leadingIcon="delete"
            />
          </Menu>
        </View>

        <View style={styles.chipRow}>
          {connection.localAddress && (
            <Chip style={styles.chip} textStyle={styles.chipText} compact>
              Local
            </Chip>
          )}
          {connection.relayUrl && (
            <Chip style={styles.chip} textStyle={styles.chipText} compact>
              Relay
            </Chip>
          )}
        </View>
      </Card.Content>
    </Card>
  );
};

/**
 * Home screen with connection list
 */
export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    connections,
    activeConnection,
    setActiveConnection,
    removeConnection,
    updateConnectionStatus,
  } = useConnection();

  const [refreshing, setRefreshing] = React.useState(false);

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Refresh connection statuses
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Connect to a workspace
  const handleConnect = useCallback(
    async (connection: VSCodeConnection) => {
      try {
        updateConnectionStatus(connection.id, 'connecting');

        // Get auth token
        const token = await authService.getAccessToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Try local connection first
        const url = connection.localAddress || connection.relayUrl;
        if (!url) {
          throw new Error('No connection URL available');
        }

        await socketService.connect(url, token);
        updateConnectionStatus(connection.id, 'connected');
        setActiveConnection(connection.id);
      } catch (error) {
        console.error('Connection failed:', error);
        updateConnectionStatus(connection.id, 'error');
      }
    },
    [updateConnectionStatus, setActiveConnection]
  );

  // Disconnect from workspace
  const handleDisconnect = useCallback(
    (connection: VSCodeConnection) => {
      socketService.disconnect();
      updateConnectionStatus(connection.id, 'disconnected');
      if (activeConnection?.id === connection.id) {
        setActiveConnection(null);
      }
    },
    [activeConnection, updateConnectionStatus, setActiveConnection]
  );

  // Remove connection
  const handleRemove = useCallback(
    (connection: VSCodeConnection) => {
      if (connection.status === 'connected') {
        socketService.disconnect();
      }
      removeConnection(connection.id);
    },
    [removeConnection]
  );

  // Render connection item
  const renderItem = ({ item }: { item: VSCodeConnection }) => (
    <ConnectionCard
      connection={item}
      isActive={activeConnection?.id === item.id}
      onConnect={() => handleConnect(item)}
      onDisconnect={() => handleDisconnect(item)}
      onRemove={() => handleRemove(item)}
    />
  );

  // Empty state
  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Connections</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to pair with VSCode
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={connections}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          connections.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={EmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007ACC"
          />
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => navigation.navigate('Pairing')}
        color="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#252526',
    borderRadius: 12,
  },
  activeCard: {
    borderColor: '#007ACC',
    borderWidth: 2,
  },
  cardContent: {
    paddingVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
  },
  connectionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#8B8B8B',
  },
  lastConnected: {
    fontSize: 12,
    color: '#666666',
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  chip: {
    backgroundColor: '#3C3C3C',
  },
  chipText: {
    fontSize: 12,
    color: '#CCCCCC',
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8B8B8B',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#007ACC',
  },
});
