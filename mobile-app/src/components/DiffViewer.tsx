import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Clipboard,
} from 'react-native';
import { Text, IconButton, Menu, Divider } from 'react-native-paper';

/**
 * Parsed diff line with metadata
 */
interface DiffLine {
  content: string;
  type: 'added' | 'removed' | 'context' | 'hunk' | 'header' | 'empty';
  oldLineNum: number | null;
  newLineNum: number | null;
}

/**
 * Diff statistics
 */
interface DiffStats {
  additions: number;
  deletions: number;
  hunks: number;
}

/**
 * Hunk info for navigation
 */
interface HunkInfo {
  index: number;
  startLine: number;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/**
 * Parse a diff string into structured lines
 */
function parseDiff(diffText: string): { lines: DiffLine[]; stats: DiffStats; hunks: HunkInfo[] } {
  const rawLines = diffText.split('\n');
  const lines: DiffLine[] = [];
  const hunks: HunkInfo[] = [];
  let stats: DiffStats = { additions: 0, deletions: 0, hunks: 0 };

  let oldLineNum = 0;
  let newLineNum = 0;

  rawLines.forEach((line, index) => {
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[3], 10);

        hunks.push({
          index: hunks.length,
          startLine: lines.length,
          oldStart: oldLineNum,
          oldCount: parseInt(match[2] || '1', 10),
          newStart: newLineNum,
          newCount: parseInt(match[4] || '1', 10),
        });
        stats.hunks++;
      }

      lines.push({
        content: line,
        type: 'hunk',
        oldLineNum: null,
        newLineNum: null,
      });
    } else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
      lines.push({
        content: line,
        type: 'header',
        oldLineNum: null,
        newLineNum: null,
      });
    } else if (line.startsWith('+')) {
      stats.additions++;
      lines.push({
        content: line.substring(1),
        type: 'added',
        oldLineNum: null,
        newLineNum: newLineNum++,
      });
    } else if (line.startsWith('-')) {
      stats.deletions++;
      lines.push({
        content: line.substring(1),
        type: 'removed',
        oldLineNum: oldLineNum++,
        newLineNum: null,
      });
    } else if (line === '') {
      lines.push({
        content: '',
        type: 'empty',
        oldLineNum: null,
        newLineNum: null,
      });
    } else {
      // Context line (starts with space or no prefix)
      const content = line.startsWith(' ') ? line.substring(1) : line;
      lines.push({
        content,
        type: 'context',
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    }
  });

  return { lines, stats, hunks };
}

/**
 * Props for DiffViewer component
 */
export interface DiffViewerProps {
  diff: string;
  fileName: string;
  filePath: string;
  isStaged?: boolean;
  onClose: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onOpenInEditor?: () => void;
}

/**
 * Enhanced Diff Viewer Component
 */
export default function DiffViewer({
  diff,
  fileName,
  filePath,
  isStaged = false,
  onClose,
  onStage,
  onUnstage,
  onDiscard,
  onOpenInEditor,
}: DiffViewerProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);

  // Parse diff
  const { lines, stats, hunks } = useMemo(() => parseDiff(diff), [diff]);

  // Get file extension for icon
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const getFileIcon = () => {
    const iconMap: Record<string, string> = {
      ts: 'language-typescript',
      tsx: 'language-typescript',
      js: 'language-javascript',
      jsx: 'language-javascript',
      json: 'code-json',
      md: 'language-markdown',
      css: 'language-css3',
      scss: 'sass',
      html: 'language-html5',
      py: 'language-python',
      java: 'language-java',
      go: 'language-go',
      rs: 'language-rust',
      rb: 'language-ruby',
      php: 'language-php',
      swift: 'apple',
      kt: 'language-kotlin',
      c: 'language-c',
      cpp: 'language-cpp',
      h: 'language-c',
      yml: 'file-code',
      yaml: 'file-code',
    };
    return iconMap[fileExtension] || 'file-document-outline';
  };

  // Navigate to hunk
  const navigateToHunk = useCallback((direction: 'prev' | 'next') => {
    if (hunks.length === 0) return;

    let newIndex = currentHunkIndex;
    if (direction === 'next') {
      newIndex = Math.min(currentHunkIndex + 1, hunks.length - 1);
    } else {
      newIndex = Math.max(currentHunkIndex - 1, 0);
    }

    setCurrentHunkIndex(newIndex);

    // Scroll to hunk (approximate based on line height)
    const lineHeight = 22;
    const targetY = hunks[newIndex].startLine * lineHeight;
    scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
  }, [currentHunkIndex, hunks]);

  // Copy line to clipboard
  const handleCopyLine = useCallback((line: DiffLine) => {
    Clipboard.setString(line.content);
    Alert.alert('Copied', 'Line copied to clipboard');
  }, []);

  // Render a single diff line
  const renderDiffLine = (line: DiffLine, index: number) => {
    const lineStyle = getLineStyle(line.type);
    const bgStyle = getLineBgStyle(line.type);
    const prefixStyle = getPrefixStyle(line.type);

    // Line prefix (+, -, space)
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

    return (
      <TouchableOpacity
        key={index}
        style={[styles.lineRow, bgStyle]}
        onLongPress={() => handleCopyLine(line)}
        activeOpacity={0.7}
      >
        {/* Line numbers */}
        {showLineNumbers && line.type !== 'header' && line.type !== 'hunk' && (
          <View style={styles.lineNumbers}>
            <Text style={styles.lineNum}>
              {line.oldLineNum !== null ? line.oldLineNum : ''}
            </Text>
            <Text style={styles.lineNum}>
              {line.newLineNum !== null ? line.newLineNum : ''}
            </Text>
          </View>
        )}

        {/* Line content */}
        <View style={styles.lineContent}>
          {line.type !== 'header' && line.type !== 'hunk' && (
            <Text style={[styles.linePrefix, prefixStyle]}>{prefix}</Text>
          )}
          <Text style={[styles.lineText, lineStyle]} numberOfLines={1}>
            {line.content || ' '}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Empty diff state
  if (!diff || diff.trim() === '') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <IconButton icon={getFileIcon()} size={20} iconColor="#007ACC" />
          <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          <IconButton icon="close" size={20} iconColor="#CCCCCC" onPress={onClose} />
        </View>
        <View style={styles.emptyState}>
          <IconButton icon="file-question-outline" size={48} iconColor="#8B8B8B" />
          <Text style={styles.emptyText}>No changes to display</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton icon={getFileIcon()} size={20} iconColor="#007ACC" />
        <View style={styles.headerInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          <Text style={styles.filePath} numberOfLines={1}>{filePath}</Text>
        </View>
        <IconButton icon="close" size={20} iconColor="#CCCCCC" onPress={onClose} />
      </View>

      {/* Stats and Actions Bar */}
      <View style={styles.statsBar}>
        {/* Stats */}
        <View style={styles.stats}>
          <View style={styles.statBadge}>
            <Text style={styles.additionsText}>+{stats.additions}</Text>
          </View>
          <View style={[styles.statBadge, styles.deletionsBadge]}>
            <Text style={styles.deletionsText}>-{stats.deletions}</Text>
          </View>
          {hunks.length > 1 && (
            <Text style={styles.hunkInfo}>
              Hunk {currentHunkIndex + 1}/{hunks.length}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {/* Hunk navigation */}
          {hunks.length > 1 && (
            <>
              <IconButton
                icon="chevron-up"
                size={18}
                iconColor={currentHunkIndex > 0 ? '#CCCCCC' : '#4A4A4A'}
                onPress={() => navigateToHunk('prev')}
                disabled={currentHunkIndex === 0}
              />
              <IconButton
                icon="chevron-down"
                size={18}
                iconColor={currentHunkIndex < hunks.length - 1 ? '#CCCCCC' : '#4A4A4A'}
                onPress={() => navigateToHunk('next')}
                disabled={currentHunkIndex === hunks.length - 1}
              />
            </>
          )}

          {/* Toggle line numbers */}
          <IconButton
            icon={showLineNumbers ? 'numeric' : 'numeric-off'}
            size={18}
            iconColor={showLineNumbers ? '#007ACC' : '#8B8B8B'}
            onPress={() => setShowLineNumbers(!showLineNumbers)}
          />

          {/* More actions menu */}
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={18}
                iconColor="#CCCCCC"
                onPress={() => setMenuVisible(true)}
              />
            }
            contentStyle={styles.menuContent}
          >
            {isStaged ? (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onUnstage?.();
                }}
                title="Unstage File"
                leadingIcon="minus-circle-outline"
              />
            ) : (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onStage?.();
                }}
                title="Stage File"
                leadingIcon="plus-circle-outline"
              />
            )}
            {!isStaged && onDiscard && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onDiscard();
                }}
                title="Discard Changes"
                leadingIcon="undo"
                titleStyle={styles.discardText}
              />
            )}
            <Divider />
            {onOpenInEditor && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onOpenInEditor();
                }}
                title="Open in Editor"
                leadingIcon="open-in-new"
              />
            )}
          </Menu>
        </View>
      </View>

      {/* Diff Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.diffContent}
        horizontal
        contentContainerStyle={styles.horizontalContent}
      >
        <ScrollView nestedScrollEnabled>
          {lines.map((line, index) => renderDiffLine(line, index))}
        </ScrollView>
      </ScrollView>

      {/* Quick Actions Footer */}
      <View style={styles.footer}>
        {isStaged ? (
          <TouchableOpacity style={styles.footerButton} onPress={onUnstage}>
            <IconButton icon="minus-circle-outline" size={16} iconColor="#CCA700" />
            <Text style={styles.footerButtonText}>Unstage</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.footerButton} onPress={onStage}>
              <IconButton icon="plus-circle-outline" size={16} iconColor="#73C991" />
              <Text style={[styles.footerButtonText, { color: '#73C991' }]}>Stage</Text>
            </TouchableOpacity>
            {onDiscard && (
              <TouchableOpacity style={styles.footerButton} onPress={onDiscard}>
                <IconButton icon="undo" size={16} iconColor="#F44336" />
                <Text style={[styles.footerButtonText, { color: '#F44336' }]}>Discard</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// Style helpers
const getLineStyle = (type: DiffLine['type']) => {
  switch (type) {
    case 'added':
      return styles.addedText;
    case 'removed':
      return styles.removedText;
    case 'hunk':
      return styles.hunkText;
    case 'header':
      return styles.headerText;
    default:
      return styles.contextText;
  }
};

const getLineBgStyle = (type: DiffLine['type']) => {
  switch (type) {
    case 'added':
      return styles.addedBg;
    case 'removed':
      return styles.removedBg;
    case 'hunk':
      return styles.hunkBg;
    default:
      return null;
  }
};

const getPrefixStyle = (type: DiffLine['type']) => {
  switch (type) {
    case 'added':
      return styles.addedPrefix;
    case 'removed':
      return styles.removedPrefix;
    default:
      return styles.contextPrefix;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingRight: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  headerInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  filePath: {
    fontSize: 11,
    color: '#666666',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statBadge: {
    backgroundColor: 'rgba(115, 201, 145, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  deletionsBadge: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  additionsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#73C991',
  },
  deletionsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F44336',
  },
  hunkInfo: {
    fontSize: 12,
    color: '#8B8B8B',
    marginLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuContent: {
    backgroundColor: '#2D2D2D',
  },
  discardText: {
    color: '#F44336',
  },
  diffContent: {
    flex: 1,
  },
  horizontalContent: {
    minWidth: '100%',
  },
  lineRow: {
    flexDirection: 'row',
    minHeight: 22,
  },
  lineNumbers: {
    flexDirection: 'row',
    width: 80,
    backgroundColor: '#252526',
    borderRightWidth: 1,
    borderRightColor: '#3C3C3C',
  },
  lineNum: {
    width: 40,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5A5A5A',
    textAlign: 'right',
    paddingRight: 8,
    lineHeight: 22,
  },
  lineContent: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 16,
  },
  linePrefix: {
    width: 16,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 22,
    textAlign: 'center',
  },
  lineText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 22,
    paddingLeft: 4,
  },
  // Line type styles
  contextText: {
    color: '#CCCCCC',
  },
  contextPrefix: {
    color: '#5A5A5A',
  },
  addedText: {
    color: '#73C991',
  },
  addedPrefix: {
    color: '#73C991',
    fontWeight: 'bold',
  },
  addedBg: {
    backgroundColor: 'rgba(115, 201, 145, 0.08)',
  },
  removedText: {
    color: '#F44336',
  },
  removedPrefix: {
    color: '#F44336',
    fontWeight: 'bold',
  },
  removedBg: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
  },
  hunkText: {
    color: '#569CD6',
    fontStyle: 'italic',
    paddingLeft: 8,
  },
  hunkBg: {
    backgroundColor: 'rgba(86, 156, 214, 0.08)',
  },
  headerText: {
    color: '#8B8B8B',
    paddingLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3C',
    gap: 24,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerButtonText: {
    fontSize: 14,
    color: '#CCCCCC',
    marginLeft: -8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8B8B8B',
    marginTop: 8,
  },
});
