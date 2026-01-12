import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConnectionProvider } from './src/contexts/ConnectionContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineBanner } from './src/components/OfflineBanner';

// Import actual screens
import PairingScreen from './src/screens/PairingScreen';
import HomeScreen from './src/screens/HomeScreen';
import EditorScreen from './src/screens/EditorScreen';
import TerminalScreen from './src/screens/TerminalScreen';
import FilesScreen from './src/screens/FilesScreen';
import SourceControlScreen from './src/screens/SourceControlScreen';
import AIChatScreen from './src/screens/AIChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Navigation types
export type RootStackParamList = {
  Main: undefined;
  Pairing: undefined;
  Editor: { filePath: string };
  Settings: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Files: undefined;
  SourceControl: undefined;
  Terminal: undefined;
  AIChat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Custom dark theme
const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#007ACC',
    secondary: '#3794FF',
    background: '#1E1E1E',
    surface: '#252526',
    surfaceVariant: '#2D2D2D',
    onSurface: '#CCCCCC',
    onSurfaceVariant: '#8B8B8B',
  },
};

// Main tab navigator
type MainTabsProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
};

function MainTabs({ navigation }: MainTabsProps) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerRight: () => (
          <MaterialCommunityIcons
            name="cog-outline"
            size={24}
            color={theme.colors.onSurface}
            style={{ marginRight: 16 }}
            onPress={() => navigation.navigate('Settings')}
          />
        ),
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.surfaceVariant,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Connections',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="lan-connect" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Files"
        component={FilesScreen}
        options={{
          title: 'Files',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="folder-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SourceControl"
        component={SourceControlScreen}
        options={{
          title: 'Source Control',
          tabBarLabel: 'Git',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="source-branch" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Terminal"
        component={TerminalScreen}
        options={{
          title: 'Terminal',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="console" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{
          title: 'AI Chat',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="robot-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// App content with offline banner
function AppContent() {
  return (
    <View style={styles.container}>
      <NavigationContainer>
        <StatusBar style="light" />
        <OfflineBanner />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.onSurface,
          }}
        >
          <Stack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Pairing"
            component={PairingScreen}
            options={{ title: 'Connect to VSCode' }}
          />
          <Stack.Screen
            name="Editor"
            component={EditorScreen}
            options={{ title: 'Editor' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

// Main app component
export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ErrorBoundary>
          <ConnectionProvider>
            <AppContent />
          </ConnectionProvider>
        </ErrorBoundary>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
});
