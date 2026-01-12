import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { vscodeAPI, FileEntry } from '../services/vscode-api';

/**
 * File icon based on extension
 */
const getFileIcon = (entry: FileEntry): string => {
  if (entry.type === 'directory') {
    return 'folder';
  }

  const ext = entry.extension?.toLowerCase();
  const iconMap: Record<string, string> = {
    '.ts': 'language-typescript',
    '.tsx': 'react',
    '.js': 'language-javascript',
    '.jsx': 'react',
    '.json': 'code-json',
    '.md': 'language-markdown',
    '.html': 'language-html5',
    '.css': 'language-css3',
    '.scss': 'sass',
    '.py': 'language-python',
    '.rb': 'language-ruby',
    '.go': 'language-go',
    '.rs': 'language-rust',
    '.java': 'language-java',
    '.c': 'language-c',
    '.cpp': 'language-cpp',
    '.swift': 'language-swift',
    '.kt': 'language-kotlin',
    '.php': 'language-php',
    '.sql': 'database',
    '.sh': 'console',
    '.yaml': 'file-code',
    '.yml': 'file-code',
    '.xml': 'file-xml-box',
    '.svg': 'svg',
    '.png': 'file-image',
    '.jpg': 'file-image',
    '.gif': 'file-image',
    '.pdf': 'file-pdf-box',
  };

  return iconMap[ext || ''] || 'file-document-outline';
};

/**
 * Format file size
 */
const formatSize = (size?: number): string => {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * File item component
 */
const FileItem: React.FC<{
  entry: FileEntry;
  depth: number;
  onPress: (entry: FileEntry) => void;
}> = ({ entry, depth, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.item, { paddingLeft: 16 + depth * 20 }]}
      onPress={() => onPress(entry)}
      activeOpacity={0.7}
    >
      <IconButton
        icon={getFileIcon(entry)}
        size={20}
        iconColor={entry.type === 'directory' ? '#DCAD56' : '#8B8B8B'}
        style={styles.icon}
      />
      <View style={styles.itemContent}>
        <Text style={styles.fileName} numberOfLines={1}>
          {entry.name}
        </Text>
        {entry.size !== undefined && (
          <Text style={styles.fileSize}>{formatSize(entry.size)}</Text>
        )}
      </View>
      {entry.type === 'directory' && (
        <IconButton
          icon="chevron-right"
          size={20}
          iconColor="#666666"
          style={styles.chevron}
        />
      )}
    </TouchableOpacity>
  );
};

/**
 * Props for FileTree component
 */
interface FileTreeProps {
  onFileSelect: (file: FileEntry) => void;
  onDirectorySelect?: (directory: FileEntry) => void;
  rootPath?: string;
}

/**
 * File tree component with navigation
 */
export default function FileTree({
  onFileSelect,
  onDirectorySelect,
  rootPath = '',
}: FileTreeProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  // Load directory contents
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const files = await vscodeAPI.listFiles(path);
      setEntries(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load directory';
      setError(message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory
  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Navigate to directory
  const navigateTo = useCallback((path: string) => {
    setPathHistory(prev => [...prev, currentPath]);
    setCurrentPath(path);
  }, [currentPath]);

  // Navigate back
  const navigateBack = useCallback(() => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory[pathHistory.length - 1];
      setPathHistory(prev => prev.slice(0, -1));
      setCurrentPath(previousPath);
    }
  }, [pathHistory]);

  // Handle item press
  const handleItemPress = useCallback((entry: FileEntry) => {
    if (entry.type === 'directory') {
      navigateTo(entry.path);
      onDirectorySelect?.(entry);
    } else {
      onFileSelect(entry);
    }
  }, [navigateTo, onFileSelect, onDirectorySelect]);

  // Get breadcrumb parts
  const getBreadcrumbs = (): string[] => {
    if (!currentPath) return ['Root'];
    return ['Root', ...currentPath.split('/').filter(Boolean)];
  };

  // Render breadcrumb navigation
  const renderBreadcrumbs = () => {
    const parts = getBreadcrumbs();
    return (
      <View style={styles.breadcrumbs}>
        {pathHistory.length > 0 && (
          <IconButton
            icon="arrow-left"
            size={20}
            iconColor="#007ACC"
            onPress={navigateBack}
            style={styles.backButton}
          />
        )}
        <Text style={styles.breadcrumbText} numberOfLines={1}>
          {parts.join(' / ')}
        </Text>
      </View>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <View style={styles.container}>
        {renderBreadcrumbs()}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007ACC" />
        </View>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={styles.container}>
        {renderBreadcrumbs()}
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadDirectory(currentPath)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render empty state
  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        {renderBreadcrumbs()}
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Empty directory</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderBreadcrumbs()}
      <FlatList
        data={entries}
        renderItem={({ item }) => (
          <FileItem
            entry={item}
            depth={0}
            onPress={handleItemPress}
          />
        )}
        keyExtractor={(item) => item.path}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#252526',
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  backButton: {
    margin: 0,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
    marginLeft: 4,
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  icon: {
    margin: 0,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 4,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
  },
  fileSize: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 8,
  },
  chevron: {
    margin: 0,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007ACC',
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
  },
});
