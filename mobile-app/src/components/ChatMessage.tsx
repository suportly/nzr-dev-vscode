import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { AIMessage } from '../services/vscode-api';

/**
 * Props for ChatMessage component
 */
interface ChatMessageProps {
  message: AIMessage;
  isStreaming?: boolean;
}

/**
 * Chat message bubble component
 */
export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
        isSystem && styles.systemContainer,
      ]}
    >
      {/* Role Label */}
      <Text
        style={[
          styles.roleLabel,
          isUser ? styles.userLabel : styles.assistantLabel,
          isSystem && styles.systemLabel,
        ]}
      >
        {isUser ? 'You' : isSystem ? 'System' : 'AI'}
      </Text>

      {/* Message Content */}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          isSystem && styles.systemBubble,
        ]}
      >
        {isStreaming && !message.content ? (
          <View style={styles.streamingContainer}>
            <ActivityIndicator size="small" color="#007ACC" />
            <Text style={styles.streamingText}>Thinking...</Text>
          </View>
        ) : (
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userText : styles.assistantText,
              isSystem && styles.systemText,
            ]}
            selectable
          >
            {message.content || '...'}
          </Text>
        )}
      </View>

      {/* Timestamp */}
      <Text style={styles.timestamp}>
        {formatTime(message.timestamp)}
      </Text>
    </View>
  );
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  systemContainer: {
    alignSelf: 'center',
    maxWidth: '95%',
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userLabel: {
    color: '#007ACC',
    textAlign: 'right',
  },
  assistantLabel: {
    color: '#6A9955',
  },
  systemLabel: {
    color: '#8B8B8B',
    textAlign: 'center',
  },
  bubble: {
    padding: 12,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: '#007ACC',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#2D2D2D',
    borderBottomLeftRadius: 4,
  },
  systemBubble: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#3C3C3C',
    borderRadius: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#D4D4D4',
  },
  systemText: {
    color: '#8B8B8B',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  streamingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streamingText: {
    color: '#8B8B8B',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: 10,
    color: '#666666',
    marginTop: 4,
  },
});
