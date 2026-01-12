import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, IconButton, ActivityIndicator, Chip } from 'react-native-paper';

import { useConnection } from '../contexts/ConnectionContext';
import { vscodeAPI, GitFileStatus } from '../services/vscode-api';
import DiffViewer from '../components/DiffViewer';

/**
 * Get status icon and color for a git file
 */
const getStatusInfo = (file: GitFileStatus): { icon: string; color: string; label: string } => {
  if (file.untracked) {
    return { icon: 'help-circle-outline', color: '#73C991', label: 'U' };
  }
  if (file.added) {
    return { icon: 'plus-circle-outline', color: '#73C991', label: 'A' };
  }
  if (file.deleted) {
    return { icon: 'minus-circle-outline', color: '#F44336', label: 'D' };
  }
  if (file.renamed) {
    return { icon: 'arrow-right-circle-outline', color: '#569CD6', label: 'R' };
  }
  if (file.modified) {
    return { icon: 'pencil-circle-outline', color: '#CCA700', label: 'M' };
  }
  return { icon: 'circle-outline', color: '#8B8B8B', label: '?' };
};

/**
 * File change item component
 */
const FileChangeItem: React.FC<{
  file: GitFileStatus;
  onPress: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}> = ({ file, onPress, onStage, onUnstage, onDiscard }) => {
  const { icon, color, label } = getStatusInfo(file);
  const fileName = file.path.split('/').pop() || file.path;
  const directory = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

  return (
    <TouchableOpacity style={styles.fileItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.fileInfo}>
        <View style={styles.fileHeader}>
          <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
        {directory && (
          <Text style={styles.filePath} numberOfLines={1}>
            {directory}
          </Text>
        )}
      </View>
      <View style={styles.fileActions}>
        {file.staged ? (
          <IconButton
            icon="minus"
            size={18}
            iconColor="#CCA700"
            onPress={onUnstage}
          />
        ) : (
          <>
            <IconButton
              icon="plus"
              size={18}
              iconColor="#73C991"
              onPress={onStage}
            />
            {!file.untracked && (
              <IconButton
                icon="undo"
                size={18}
                iconColor="#F44336"
                onPress={onDiscard}
              />
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};


/**
 * Source Control screen for git status and diffs
 */
export default function SourceControlScreen() {
  const { isConnected } = useConnection();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branch, setBranch] = useState<string>('');
  const [stagedFiles, setStagedFiles] = useState<GitFileStatus[]>([]);
  const [changedFiles, setChangedFiles] = useState<GitFileStatus[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Load git status
  const loadStatus = useCallback(async () => {
    if (!isConnected) return;

    try {
      const [files, branchName] = await Promise.all([
        vscodeAPI.getGitStatus(),
        vscodeAPI.getGitBranch(),
      ]);

      setBranch(branchName);
      setStagedFiles(files.filter((f) => f.staged));
      setChangedFiles(files.filter((f) => !f.staged));
    } catch (error) {
      console.error('Failed to load git status:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isConnected]);

  // Load on mount
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadStatus();
  }, [loadStatus]);

  // View file diff
  const handleViewDiff = useCallback(async (file: GitFileStatus) => {
    setSelectedFile(file);
    setLoadingDiff(true);
    try {
      const diffContent = await vscodeAPI.getGitDiff(file.path, file.staged);
      setDiff(diffContent);
    } catch (error) {
      console.error('Failed to load diff:', error);
      setDiff('Failed to load diff');
    } finally {
      setLoadingDiff(false);
    }
  }, []);

  // Stage file
  const handleStage = useCallback(async (file: GitFileStatus) => {
    try {
      await vscodeAPI.stageFile(file.path);
      loadStatus();
    } catch (error) {
      console.error('Failed to stage file:', error);
      Alert.alert('Error', 'Failed to stage file');
    }
  }, [loadStatus]);

  // Unstage file
  const handleUnstage = useCallback(async (file: GitFileStatus) => {
    try {
      await vscodeAPI.unstageFile(file.path);
      loadStatus();
    } catch (error) {
      console.error('Failed to unstage file:', error);
      Alert.alert('Error', 'Failed to unstage file');
    }
  }, [loadStatus]);

  // Discard changes
  const handleDiscard = useCallback((file: GitFileStatus) => {
    Alert.alert(
      'Discard Changes',
      `Are you sure you want to discard changes in ${file.path}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await vscodeAPI.discardChanges(file.path);
              loadStatus();
            } catch (error) {
              console.error('Failed to discard changes:', error);
              Alert.alert('Error', 'Failed to discard changes');
            }
          },
        },
      ]
    );
  }, [loadStatus]);

  // Close diff viewer
  const closeDiff = useCallback(() => {
    setSelectedFile(null);
    setDiff('');
  }, []);

  // Open file in VSCode editor
  const handleOpenInEditor = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await vscodeAPI.openFile(selectedFile.path);
      closeDiff();
    } catch (error) {
      console.error('Failed to open file:', error);
      Alert.alert('Error', 'Failed to open file in editor');
    }
  }, [selectedFile, closeDiff]);

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.disconnectedText}>Not connected to VSCode</Text>
        <Text style={styles.hintText}>Connect to a workspace first</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007ACC" />
        <Text style={styles.loadingText}>Loading git status...</Text>
      </View>
    );
  }

  // Show diff viewer if a file is selected
  if (selectedFile) {
    const fileName = selectedFile.path.split('/').pop() || selectedFile.path;
    const directory = selectedFile.path.includes('/')
      ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf('/'))
      : '';

    return (
      <View style={styles.container}>
        {loadingDiff ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#007ACC" />
            <Text style={styles.loadingText}>Loading diff...</Text>
          </View>
        ) : (
          <DiffViewer
            diff={diff}
            fileName={fileName}
            filePath={directory}
            isStaged={selectedFile.staged}
            onClose={closeDiff}
            onStage={() => {
              handleStage(selectedFile);
              closeDiff();
            }}
            onUnstage={() => {
              handleUnstage(selectedFile);
              closeDiff();
            }}
            onDiscard={selectedFile.untracked ? undefined : () => {
              handleDiscard(selectedFile);
            }}
            onOpenInEditor={handleOpenInEditor}
          />
        )}
      </View>
    );
  }

  const totalChanges = stagedFiles.length + changedFiles.length;

  return (
    <View style={styles.container}>
      {/* Branch info */}
      <View style={styles.branchBar}>
        <IconButton icon="source-branch" size={20} iconColor="#007ACC" />
        <Text style={styles.branchName}>{branch || 'No branch'}</Text>
        <Chip style={styles.changeCount} textStyle={styles.changeCountText} compact>
          {totalChanges} changes
        </Chip>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007ACC"
          />
        }
      >
        {/* Staged Changes */}
        {stagedFiles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Staged Changes</Text>
              <Text style={styles.sectionCount}>{stagedFiles.length}</Text>
            </View>
            {stagedFiles.map((file) => (
              <FileChangeItem
                key={`staged-${file.path}`}
                file={file}
                onPress={() => handleViewDiff(file)}
                onUnstage={() => handleUnstage(file)}
              />
            ))}
          </View>
        )}

        {/* Changes */}
        {changedFiles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Changes</Text>
              <Text style={styles.sectionCount}>{changedFiles.length}</Text>
            </View>
            {changedFiles.map((file) => (
              <FileChangeItem
                key={`changed-${file.path}`}
                file={file}
                onPress={() => handleViewDiff(file)}
                onStage={() => handleStage(file)}
                onDiscard={() => handleDiscard(file)}
              />
            ))}
          </View>
        )}

        {/* No changes */}
        {totalChanges === 0 && (
          <View style={styles.emptyState}>
            <IconButton icon="check-circle-outline" size={48} iconColor="#73C991" />
            <Text style={styles.emptyText}>No changes</Text>
            <Text style={styles.emptySubtext}>Working tree is clean</Text>
          </View>
        )}
      </ScrollView>
    </View>
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
  loadingText: {
    fontSize: 14,
    color: '#8B8B8B',
    marginTop: 12,
  },
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  branchName: {
    flex: 1,
    fontSize: 14,
    color: '#007ACC',
    fontWeight: '600',
  },
  changeCount: {
    backgroundColor: '#3C3C3C',
  },
  changeCountText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#252526',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    color: '#8B8B8B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 12,
    color: '#8B8B8B',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  fileInfo: {
    flex: 1,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 16,
    marginRight: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
  },
  filePath: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 24,
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 18,
    color: '#CCCCCC',
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8B8B8B',
    marginTop: 4,
  },
});
