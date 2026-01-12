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
} from 'react-native';
import { IconButton, ActivityIndicator, Chip, Banner } from 'react-native-paper';
import { vscodeAPI, AIStatus, AIChatSession, AIMessage, AIExtensionInfo } from '../services/vscode-api';
import { useConnection } from '../contexts/ConnectionContext';
import { socketService } from '../services/socket';
import ChatMessage from '../components/ChatMessage';

/**
 * AI Chat screen for communicating with AI extensions
 */
export default function AIChatScreen() {
  const { isConnected } = useConnection();
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [session, setSession] = useState<AIChatSession | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load AI status on mount and connection change
  useEffect(() => {
    if (isConnected) {
      loadAIStatus();
    } else {
      setStatus(null);
      setSession(null);
      setMessages([]);
    }
  }, [isConnected]);

  // Subscribe to AI events
  useEffect(() => {
    const handleMessage = (data: { sessionId: string; message: AIMessage }) => {
      if (session && data.sessionId === session.id) {
        setMessages((prev) => {
          // Check if message already exists by ID
          const existingIndex = prev.findIndex((m) => m.id === data.message.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = data.message;
            return updated;
          }

          // For user messages, check if there's a temp message with same content (optimistic update)
          if (data.message.role === 'user') {
            const tempIndex = prev.findIndex(
              (m) => m.id.startsWith('temp_') && m.content === data.message.content
            );
            if (tempIndex >= 0) {
              // Replace temp message with real one
              const updated = [...prev];
              updated[tempIndex] = data.message;
              return updated;
            }
          }

          return [...prev, data.message];
        });
      }
    };

    const handleStreamStart = (data: { sessionId: string; messageId: string }) => {
      if (session && data.sessionId === session.id) {
        setStreamingMessageId(data.messageId);
      }
    };

    const handleStreamEnd = (data: { sessionId: string; messageId: string }) => {
      if (session && data.sessionId === session.id) {
        setStreamingMessageId(null);
      }
    };

    const handleStreamChunk = (data: { sessionId: string; messageId: string; content: string }) => {
      if (session && data.sessionId === session.id) {
        setMessages((prev) => {
          const existingIndex = prev.findIndex((m) => m.id === data.messageId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              content: data.content,
              isStreaming: true,
            };
            return updated;
          }
          // If message doesn't exist yet, create it
          return [
            ...prev,
            {
              id: data.messageId,
              role: 'assistant' as const,
              content: data.content,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            },
          ];
        });
      }
    };

    socketService.on('ai:message', handleMessage);
    socketService.on('ai:streamStart', handleStreamStart);
    socketService.on('ai:streamEnd', handleStreamEnd);
    socketService.on('ai:streamChunk', handleStreamChunk);

    return () => {
      socketService.off('ai:message', handleMessage);
      socketService.off('ai:streamStart', handleStreamStart);
      socketService.off('ai:streamEnd', handleStreamEnd);
      socketService.off('ai:streamChunk', handleStreamChunk);
    };
  }, [session]);

  // Load AI status
  const loadAIStatus = async () => {
    setLoading(true);
    try {
      const aiStatus = await vscodeAPI.getAIStatus();
      setStatus(aiStatus);

      if (aiStatus.available && !session) {
        // Create a new session automatically
        await createSession();
      }
    } catch (error) {
      console.error('Failed to load AI status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create new chat session
  const createSession = async () => {
    try {
      const newSession = await vscodeAPI.createAISession();
      setSession(newSession);
      setMessages(newSession.messages);
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to create AI chat session');
    }
  };

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || !session || sending) return;

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    // Optimistically add user message
    const userMessage: AIMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      await vscodeAPI.sendAIMessage(session.id, messageText, {
        includeContext: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      Alert.alert('Error', message);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setSending(false);
    }
  };

  // New chat
  const handleNewChat = async () => {
    Alert.alert(
      'New Chat',
      'Start a new chat session? Current messages will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Chat',
          onPress: async () => {
            setMessages([]);
            await createSession();
          },
        },
      ]
    );
  };

  // Clear chat
  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat',
      'Clear all messages from this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => setMessages([]),
        },
      ]
    );
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Render AI unavailable state
  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.unavailableTitle}>Not Connected</Text>
        <Text style={styles.unavailableText}>
          Connect to a VSCode workspace first
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007ACC" />
        <Text style={styles.loadingText}>Checking AI availability...</Text>
      </View>
    );
  }

  if (!status?.available) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.unavailableTitle}>AI Not Available</Text>
        <Text style={styles.unavailableText}>
          No AI extensions detected in VSCode.
        </Text>
        <Text style={styles.hintText}>
          Install Claude Code, GitHub Copilot, or Codeium to enable AI chat.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAIStatus}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Header with AI info */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            {status.activeExtension?.name || 'AI Chat'}
          </Text>
          <Chip
            compact
            style={styles.statusChip}
            textStyle={styles.statusChipText}
          >
            {status.activeExtension?.isActive ? 'Active' : 'Ready'}
          </Chip>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            icon="refresh"
            size={20}
            iconColor="#CCCCCC"
            onPress={loadAIStatus}
          />
          <IconButton
            icon="plus"
            size={20}
            iconColor="#007ACC"
            onPress={handleNewChat}
          />
          <IconButton
            icon="delete-sweep"
            size={20}
            iconColor="#CCCCCC"
            onPress={handleClearChat}
          />
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptyText}>
              Ask questions about your code, request explanations, or get help with development tasks.
            </Text>
            <View style={styles.suggestionsContainer}>
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={() => setInputText('Explain this code')}
              >
                <Text style={styles.suggestionText}>Explain this code</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={() => setInputText('Find bugs in this file')}
              >
                <Text style={styles.suggestionText}>Find bugs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={() => setInputText('Suggest improvements')}
              >
                <Text style={styles.suggestionText}>Suggest improvements</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={message.id === streamingMessageId}
            />
          ))
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          placeholder="Ask AI anything..."
          placeholderTextColor="#666666"
          multiline
          maxLength={4000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <IconButton
              icon="send"
              size={20}
              iconColor="#FFFFFF"
              style={{ margin: 0 }}
            />
          )}
        </TouchableOpacity>
      </View>
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
    padding: 24,
  },
  loadingText: {
    color: '#8B8B8B',
    marginTop: 16,
  },
  unavailableTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#CCCCCC',
    marginBottom: 8,
  },
  unavailableText: {
    fontSize: 14,
    color: '#8B8B8B',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007ACC',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252526',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CCCCCC',
    marginRight: 8,
  },
  statusChip: {
    backgroundColor: '#6A9955',
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
  },
  headerActions: {
    flexDirection: 'row',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 12,
    paddingBottom: 24,
  },
  emptyContainer: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#CCCCCC',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8B8B8B',
    textAlign: 'center',
    maxWidth: 300,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  suggestionButton: {
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3C3C3C',
  },
  suggestionText: {
    color: '#007ACC',
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#252526',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3C',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3C3C3C',
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    backgroundColor: '#007ACC',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#3C3C3C',
  },
});
