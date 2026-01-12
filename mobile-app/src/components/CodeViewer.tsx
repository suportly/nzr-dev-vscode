import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

/**
 * Simple syntax highlighting colors based on language
 */
const SYNTAX_COLORS: Record<string, string> = {
  keyword: '#569CD6',
  string: '#CE9178',
  comment: '#6A9955',
  number: '#B5CEA8',
  function: '#DCDCAA',
  type: '#4EC9B0',
  variable: '#9CDCFE',
  operator: '#D4D4D4',
  punctuation: '#808080',
  default: '#D4D4D4',
};

/**
 * Language-specific keywords
 */
const KEYWORDS: Record<string, string[]> = {
  typescript: [
    'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
    'import', 'export', 'from', 'default', 'return', 'if', 'else', 'for',
    'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch',
    'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements',
    'public', 'private', 'protected', 'static', 'readonly', 'abstract',
    'async', 'await', 'null', 'undefined', 'true', 'false', 'void',
  ],
  javascript: [
    'const', 'let', 'var', 'function', 'class', 'import', 'export', 'from',
    'default', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
    'new', 'this', 'super', 'extends', 'async', 'await', 'null',
    'undefined', 'true', 'false', 'void',
  ],
  python: [
    'def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else',
    'for', 'while', 'break', 'continue', 'try', 'except', 'finally',
    'raise', 'with', 'lambda', 'pass', 'yield', 'assert', 'global',
    'nonlocal', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is',
  ],
};

/**
 * Very simple tokenizer for basic syntax highlighting
 */
function tokenize(
  line: string,
  language: string
): Array<{ text: string; type: string }> {
  const tokens: Array<{ text: string; type: string }> = [];
  const keywords = KEYWORDS[language] || KEYWORDS.javascript || [];

  // Simple regex-based tokenization
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*|\/\*[\s\S]*?\*\/|\d+\.?\d*|[a-zA-Z_]\w*|[^\s])/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    let type = 'default';

    if (text.startsWith('//') || text.startsWith('/*')) {
      type = 'comment';
    } else if (text.startsWith('"') || text.startsWith("'") || text.startsWith('`')) {
      type = 'string';
    } else if (/^\d/.test(text)) {
      type = 'number';
    } else if (keywords.includes(text)) {
      type = 'keyword';
    } else if (/^[a-zA-Z_]\w*$/.test(text)) {
      // Check if it looks like a function call
      const nextChar = line[match.index + text.length];
      if (nextChar === '(') {
        type = 'function';
      } else if (text[0] === text[0].toUpperCase()) {
        type = 'type';
      } else {
        type = 'variable';
      }
    } else if (/^[+\-*/%=<>!&|^~?:]/.test(text)) {
      type = 'operator';
    } else if (/^[{}[\](),;.]/.test(text)) {
      type = 'punctuation';
    }

    tokens.push({ text, type });
  }

  return tokens;
}

/**
 * Props for CodeViewer component
 */
interface CodeViewerProps {
  content: string;
  language?: string;
  fileName?: string;
  loading?: boolean;
  onLinePress?: (lineNumber: number) => void;
  initialLine?: number;
}

/**
 * Code viewer with syntax highlighting and line numbers
 */
export default function CodeViewer({
  content,
  language = 'plaintext',
  fileName,
  loading = false,
  onLinePress,
  initialLine = 0,
}: CodeViewerProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  // Split content into lines
  const lines = content.split('\n');

  // Calculate line number width
  const lineNumberWidth = Math.max(3, String(lines.length).length) * 10 + 16;

  // Handle line press
  const handleLinePress = useCallback((lineNumber: number) => {
    setSelectedLine(lineNumber);
    onLinePress?.(lineNumber);
  }, [onLinePress]);

  // Render a single line
  const renderLine = (line: string, lineNumber: number) => {
    const tokens = tokenize(line, language);
    const isSelected = selectedLine === lineNumber;

    return (
      <TouchableOpacity
        key={lineNumber}
        style={[styles.line, isSelected && styles.selectedLine]}
        onPress={() => handleLinePress(lineNumber)}
        activeOpacity={0.7}
      >
        <View style={[styles.lineNumber, { width: lineNumberWidth }]}>
          <Text style={styles.lineNumberText}>{lineNumber + 1}</Text>
        </View>
        <View style={styles.lineContent}>
          <Text style={styles.codeText}>
            {tokens.length === 0 ? (
              ' '
            ) : (
              tokens.map((token, i) => (
                <Text
                  key={i}
                  style={{ color: SYNTAX_COLORS[token.type] || SYNTAX_COLORS.default }}
                >
                  {token.text}
                </Text>
              ))
            )}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007ACC" />
          <Text style={styles.loadingText}>Loading file...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {fileName && (
        <View style={styles.header}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={styles.languageTag}>{language}</Text>
        </View>
      )}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        horizontal
        showsHorizontalScrollIndicator={true}
      >
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.contentContainer}
        >
          {lines.map((line, index) => renderLine(line, index))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#252526',
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
    fontFamily: 'monospace',
  },
  languageTag: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 8,
    textTransform: 'lowercase',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    minWidth: Dimensions.get('window').width,
  },
  line: {
    flexDirection: 'row',
    minHeight: 22,
  },
  selectedLine: {
    backgroundColor: 'rgba(0, 122, 204, 0.2)',
  },
  lineNumber: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
    backgroundColor: '#1E1E1E',
  },
  lineNumberText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#858585',
  },
  lineContent: {
    flex: 1,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#3C3C3C',
  },
  codeText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#8B8B8B',
  },
});
