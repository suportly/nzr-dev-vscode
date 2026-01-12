import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { IconButton, ActivityIndicator, Chip, FAB } from 'react-native-paper';
import { vscodeAPI, TerminalInfo } from '../services/vscode-api';
import { useConnection } from '../contexts/ConnectionContext';
import { socketService } from '../services/socket';

/**
 * Terminal output line
 */
interface OutputLine {
  id: string;
  text: string;
  type: 'command' | 'output' | 'error' | 'system';
  timestamp: Date;
}

/**
 * Terminal screen with command input and output display
 */
// Unique key counter to avoid duplicate keys
let keyCounter = 0;
const generateKey = (prefix: string) => `${prefix}_${Date.now()}_${++keyCounter}`;

export default function TerminalScreen() {
  const { isConnected } = useConnection();
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [currentCwd, setCurrentCwd] = useState<string>('');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState(true); // Default to streaming mode
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Handle keyboard visibility
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        // Scroll to bottom when keyboard opens
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Load terminals on mount and connection change
  useEffect(() => {
    if (isConnected) {
      loadTerminals();
    } else {
      setTerminals([]);
      setActiveTerminalId(null);
    }
  }, [isConnected]);

  // Subscribe to terminal events
  useEffect(() => {
    console.log('[Terminal] Setting up event listeners');

    const handleTerminalClosed = (data: { terminalId: string }) => {
      setTerminals((prev) => prev.filter((t) => t.id !== data.terminalId));
      if (activeTerminalId === data.terminalId) {
        setActiveTerminalId(null);
        addSystemLine('Terminal was closed');
      }
    };

    const handleActiveChanged = (data: { terminalId: string }) => {
      addSystemLine(`Active terminal changed to: ${data.terminalId}`);
    };

    // Handle streaming output
    const handleStreamOutput = (data: { streamId: string; type: string; data: string }) => {
      console.log('[Terminal] HANDLER CALLED - Stream output:', data.streamId, data.type, data.data?.substring(0, 50));
      setOutputLines((prev) => [
        ...prev,
        {
          id: generateKey('stream'),
          text: data.data,
          type: data.type === 'stderr' ? 'error' : 'output',
          timestamp: new Date(),
        },
      ]);
    };

    const handleStreamStart = (data: { streamId: string; command: string; cwd: string }) => {
      console.log('[Terminal] Stream started:', data.streamId);
      setActiveStreamId(data.streamId);
    };

    const handleStreamEnd = (data: { streamId: string; exitCode: number }) => {
      console.log('[Terminal] Stream ended:', data.streamId, 'exit code:', data.exitCode);
      setActiveStreamId(null);
      setExecuting(false);
      if (data.exitCode !== 0) {
        setOutputLines((prev) => [
          ...prev,
          {
            id: generateKey('exit'),
            text: `Exit code: ${data.exitCode}`,
            type: 'system',
            timestamp: new Date(),
          },
        ]);
      }
    };

    socketService.on('terminal:closed', handleTerminalClosed);
    socketService.on('terminal:activeChanged', handleActiveChanged);
    socketService.on('terminal:output', handleStreamOutput);
    socketService.on('terminal:streamStart', handleStreamStart);
    socketService.on('terminal:streamEnd', handleStreamEnd);

    console.log('[Terminal] Event listeners registered for terminal:output, terminal:streamStart, terminal:streamEnd');

    return () => {
      console.log('[Terminal] Cleaning up event listeners');
      socketService.off('terminal:closed', handleTerminalClosed);
      socketService.off('terminal:activeChanged', handleActiveChanged);
      socketService.off('terminal:output', handleStreamOutput);
      socketService.off('terminal:streamStart', handleStreamStart);
      socketService.off('terminal:streamEnd', handleStreamEnd);
    };
  }, [activeTerminalId]);

  // Load available terminals
  const loadTerminals = async () => {
    setLoading(true);
    try {
      const terminalList = await vscodeAPI.listTerminals();
      setTerminals(terminalList);

      // Set first terminal as active if none selected
      if (terminalList.length > 0 && !activeTerminalId) {
        const activeOne = terminalList.find((t) => t.isActive) || terminalList[0];
        setActiveTerminalId(activeOne.id);
      }

      // Load current working directory
      const cwd = await vscodeAPI.getCwd();
      setCurrentCwd(cwd);
    } catch (error) {
      console.error('Failed to load terminals:', error);
      addSystemLine('Failed to load terminals');
    } finally {
      setLoading(false);
    }
  };

  // Add a system message to output
  const addSystemLine = useCallback((text: string) => {
    setOutputLines((prev) => [
      ...prev,
      {
        id: generateKey('sys'),
        text,
        type: 'system',
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Add a command line to output
  const addCommandLine = useCallback((text: string) => {
    setOutputLines((prev) => [
      ...prev,
      {
        id: generateKey('cmd'),
        text: `$ ${text}`,
        type: 'command',
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Create new terminal
  const handleCreateTerminal = async () => {
    try {
      const terminal = await vscodeAPI.createTerminal({ name: 'NZR Terminal' });
      setTerminals((prev) => [...prev, terminal]);
      setActiveTerminalId(terminal.id);
      addSystemLine(`Created terminal: ${terminal.name}`);
    } catch (error) {
      console.error('Failed to create terminal:', error);
      Alert.alert('Error', 'Failed to create terminal');
    }
  };

  // Helper to resolve path (handles relative paths and ~)
  const resolvePath = (path: string, basePath: string): string => {
    // Handle home directory
    if (path.startsWith('~')) {
      // This will be resolved on the server side, just pass it
      return path;
    }
    // Handle absolute paths
    if (path.startsWith('/')) {
      return path;
    }
    // Handle relative paths
    if (path === '..') {
      const parts = basePath.split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/') || '/';
    }
    if (path.startsWith('../')) {
      const parts = basePath.split('/').filter(Boolean);
      parts.pop();
      return resolvePath(path.substring(3), '/' + parts.join('/'));
    }
    if (path === '.') {
      return basePath;
    }
    if (path.startsWith('./')) {
      path = path.substring(2);
    }
    // Join with base path
    return basePath.endsWith('/') ? basePath + path : basePath + '/' + path;
  };

  // Execute command
  const handleExecute = async () => {
    if (!command.trim()) return;

    const cmd = command.trim();
    setCommand('');
    setExecuting(true);
    addCommandLine(cmd);

    try {
      // Check if this is a cd command
      const cdMatch = cmd.match(/^cd\s+(.+)$/);
      if (cdMatch) {
        const targetPath = cdMatch[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        const newPath = resolvePath(targetPath, currentCwd);

        // Verify the directory exists by trying to list it
        const result = await vscodeAPI.executeCommand(`test -d "${newPath}" && echo "OK"`, {
          captureOutput: true,
        });

        if (result.exitCode === 0 && result.stdout?.includes('OK')) {
          // Directory exists, update the cwd
          await vscodeAPI.setCwd(newPath);
          setCurrentCwd(newPath);
          addSystemLine(`Changed directory to: ${newPath}`);
        } else {
          setOutputLines((prev) => [
            ...prev,
            {
              id: generateKey('err'),
              text: `cd: ${targetPath}: No such directory`,
              type: 'error',
              timestamp: new Date(),
            },
          ]);
        }
        setExecuting(false);
        return;
      }

      // Use streaming for real-time output
      if (useStreaming) {
        console.log('[Terminal] Executing streaming command:', cmd);
        // Execute with streaming - output comes via events
        const result = await vscodeAPI.executeStreaming(cmd);
        console.log('[Terminal] Streaming command started, streamId:', result.streamId);

        // Update cwd if returned
        if (result.cwd) {
          setCurrentCwd(result.cwd);
        }

        // The output will come via terminal:output events
        // setExecuting(false) will be called in handleStreamEnd
        return;
      }

      // Fallback: Execute with output capture
      const result = await vscodeAPI.executeCommand(cmd, {
        captureOutput: true,
      });

      // Update cwd if it was returned
      if (result.cwd) {
        setCurrentCwd(result.cwd);
      }

      // Display the captured output
      if (result.output) {
        setOutputLines((prev) => [
          ...prev,
          {
            id: generateKey('out'),
            text: result.output!,
            type: result.exitCode === 0 ? 'output' : 'error',
            timestamp: new Date(),
          },
        ]);
      } else if (result.stdout) {
        setOutputLines((prev) => [
          ...prev,
          {
            id: generateKey('out'),
            text: result.stdout!,
            type: 'output',
            timestamp: new Date(),
          },
        ]);
      }

      // Show stderr if present and different from stdout
      if (result.stderr && result.stderr !== result.output && result.stderr !== result.stdout) {
        setOutputLines((prev) => [
          ...prev,
          {
            id: generateKey('err'),
            text: result.stderr!,
            type: 'error',
            timestamp: new Date(),
          },
        ]);
      }

      // Show exit code if non-zero
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        addSystemLine(`Exit code: ${result.exitCode}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setOutputLines((prev) => [
        ...prev,
        {
          id: generateKey('err'),
          text: message,
          type: 'error',
          timestamp: new Date(),
        },
      ]);
      setExecuting(false);
    } finally {
      // Only set executing false for non-streaming mode
      if (!useStreaming) {
        setExecuting(false);
      }
    }
  };

  // Send interrupt (Ctrl+C) or kill stream
  const handleInterrupt = async () => {
    // If there's an active stream, kill it
    if (activeStreamId) {
      try {
        await vscodeAPI.killStream(activeStreamId);
        addSystemLine('Process terminated');
        setActiveStreamId(null);
        setExecuting(false);
      } catch (error) {
        console.error('Failed to kill stream:', error);
        Alert.alert('Error', 'Failed to terminate process');
      }
      return;
    }

    // Otherwise send Ctrl+C to terminal
    if (!activeTerminalId) {
      Alert.alert('No Process', 'No running process to interrupt');
      return;
    }

    try {
      await vscodeAPI.interruptTerminal(activeTerminalId);
      addSystemLine('Sent Ctrl+C interrupt');
    } catch (error) {
      console.error('Failed to interrupt:', error);
      Alert.alert('Error', 'Failed to send interrupt');
    }
  };

  // Close terminal
  const handleCloseTerminal = async () => {
    if (!activeTerminalId) return;

    Alert.alert(
      'Close Terminal',
      'Are you sure you want to close this terminal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              await vscodeAPI.disposeTerminal(activeTerminalId);
              setTerminals((prev) =>
                prev.filter((t) => t.id !== activeTerminalId)
              );
              setActiveTerminalId(null);
              addSystemLine('Terminal closed');
            } catch (error) {
              console.error('Failed to close terminal:', error);
              Alert.alert('Error', 'Failed to close terminal');
            }
          },
        },
      ]
    );
  };

  // Clear output
  const handleClearOutput = () => {
    setOutputLines([]);
  };

  // Scroll to bottom on new output
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [outputLines]);

  // Render terminal tabs
  const renderTerminalTabs = () => (
    <View style={styles.tabsContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {terminals.map((terminal) => (
          <Chip
            key={terminal.id}
            selected={terminal.id === activeTerminalId}
            onPress={() => setActiveTerminalId(terminal.id)}
            style={[
              styles.tab,
              terminal.id === activeTerminalId && styles.activeTab,
            ]}
            textStyle={
              terminal.id === activeTerminalId ? styles.activeTabText : styles.tabText
            }
            compact
          >
            {terminal.name}
          </Chip>
        ))}
      </ScrollView>
      <IconButton
        icon="plus"
        size={20}
        iconColor="#007ACC"
        onPress={handleCreateTerminal}
      />
    </View>
  );

  // Render output line
  const renderOutputLine = (line: OutputLine) => {
    let textStyle = styles.outputText;
    switch (line.type) {
      case 'command':
        textStyle = styles.commandText;
        break;
      case 'error':
        textStyle = styles.errorText;
        break;
      case 'system':
        textStyle = styles.systemText;
        break;
    }

    return (
      <Text key={line.id} style={textStyle} selectable>
        {line.text}
      </Text>
    );
  };

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.disconnectedText}>
          Not connected to VSCode
        </Text>
        <Text style={styles.hintText}>
          Connect to a workspace first
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Terminal Tabs */}
      {renderTerminalTabs()}

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <IconButton
          icon="refresh"
          size={20}
          iconColor="#CCCCCC"
          onPress={loadTerminals}
          disabled={loading}
        />
        <IconButton
          icon="close-octagon"
          size={20}
          iconColor="#F44336"
          onPress={handleInterrupt}
          disabled={!activeTerminalId}
        />
        <IconButton
          icon="delete-sweep"
          size={20}
          iconColor="#CCCCCC"
          onPress={handleClearOutput}
        />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="close"
          size={20}
          iconColor="#F44336"
          onPress={handleCloseTerminal}
          disabled={!activeTerminalId}
        />
      </View>

      {/* Output Area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.outputContainer}
        contentContainerStyle={styles.outputContent}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007ACC" />
            <Text style={styles.loadingText}>Loading terminals...</Text>
          </View>
        ) : outputLines.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {activeTerminalId
                ? 'Type a command below to execute'
                : 'Create or select a terminal to get started'}
            </Text>
          </View>
        ) : (
          outputLines.map(renderOutputLine)
        )}
      </ScrollView>

      {/* Current Directory */}
      {currentCwd && (
        <View style={styles.cwdContainer}>
          <Text style={styles.cwdText} numberOfLines={1} ellipsizeMode="head">
            {currentCwd}
          </Text>
        </View>
      )}

      {/* Command Input */}
      <View style={styles.inputContainer}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={command}
          onChangeText={setCommand}
          onSubmitEditing={handleExecute}
          placeholder="Enter command..."
          placeholderTextColor="#666666"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          editable={!executing}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!command.trim() || executing) && styles.sendButtonDisabled,
          ]}
          onPress={handleExecute}
          disabled={!command.trim() || executing}
        >
          {executing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>Run</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Quick Commands FAB - hidden when keyboard is visible */}
      {!keyboardVisible && (
        <FAB
          icon="console-line"
          style={styles.fab}
          onPress={() => {
            Alert.alert(
              'Quick Commands',
              'Select a common command',
              [
                { text: 'npm install', onPress: () => setCommand('npm install') },
                { text: 'npm run dev', onPress: () => setCommand('npm run dev') },
                { text: 'npm test', onPress: () => setCommand('npm test') },
                { text: 'git status', onPress: () => setCommand('git status') },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          }}
          color="#FFFFFF"
          size="small"
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  disconnectedText: {
    fontSize: 18,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  hintText: {
    fontSize: 14,
    color: '#8B8B8B',
    marginTop: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  tab: {
    marginRight: 8,
    backgroundColor: '#2D2D2D',
  },
  activeTab: {
    backgroundColor: '#007ACC',
  },
  tabText: {
    color: '#CCCCCC',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  outputContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  outputContent: {
    padding: 12,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    color: '#8B8B8B',
    marginTop: 12,
  },
  emptyContainer: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8B8B8B',
    textAlign: 'center',
  },
  outputText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#D4D4D4',
    lineHeight: 20,
  },
  commandText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#569CD6',
    lineHeight: 20,
    fontWeight: 'bold',
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#F44747',
    lineHeight: 20,
  },
  systemText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#6A9955',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  cwdContainer: {
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3C',
  },
  cwdText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#6A9955',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3C',
  },
  prompt: {
    fontFamily: 'monospace',
    fontSize: 16,
    color: '#569CD6',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#CCCCCC',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3C3C3C',
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#007ACC',
    borderRadius: 4,
    minWidth: 60,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#3C3C3C',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    backgroundColor: '#007ACC',
  },
});
