import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, IconButton, Menu, Snackbar } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import CodeViewer from '../components/CodeViewer';
import { vscodeAPI, FileContent } from '../services/vscode-api';
import { socketService } from '../services/socket';
import type { RootStackParamList } from '../../App';

type EditorScreenRouteProp = RouteProp<RootStackParamList, 'Editor'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Editor screen for viewing file content
 */
export default function EditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditorScreenRouteProp>();
  const { filePath } = route.params;

  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Get file name from path
  const fileName = filePath.split('/').pop() || filePath;

  // Load file content
  const loadFile = useCallback(async () => {
    if (!socketService.isConnected()) {
      setError('Not connected to VSCode');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await vscodeAPI.readFile(filePath);
      setFileContent(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load file';
      setError(message);
      showSnackbar(message);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  // Load file on mount
  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // Update navigation title
  useEffect(() => {
    navigation.setOptions({
      title: fileName,
      headerRight: () => (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor="#CCCCCC"
              size={24}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              handleOpenInVSCode();
            }}
            title="Open in VSCode"
            leadingIcon="open-in-new"
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              loadFile();
            }}
            title="Refresh"
            leadingIcon="refresh"
          />
        </Menu>
      ),
    });
  }, [navigation, fileName, menuVisible, loadFile]);

  // Show snackbar message
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Open file in VSCode
  const handleOpenInVSCode = useCallback(async () => {
    try {
      await vscodeAPI.openFile(filePath);
      showSnackbar('Opened in VSCode');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open file';
      showSnackbar(message);
    }
  }, [filePath]);

  // Handle line press - go to that line in VSCode
  const handleLinePress = useCallback(async (lineNumber: number) => {
    try {
      await vscodeAPI.openFile(filePath, {
        startLine: lineNumber,
        startColumn: 0,
      });
      showSnackbar(`Jumped to line ${lineNumber + 1} in VSCode`);
    } catch (err) {
      console.error('Failed to go to line:', err);
    }
  }, [filePath]);

  // Error state
  if (error && !fileContent) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <IconButton
            icon="refresh"
            iconColor="#007ACC"
            size={32}
            onPress={loadFile}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CodeViewer
        content={fileContent?.content || ''}
        language={fileContent?.language || 'plaintext'}
        fileName={fileName}
        loading={loading}
        onLinePress={handleLinePress}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  snackbar: {
    backgroundColor: '#252526',
  },
});
