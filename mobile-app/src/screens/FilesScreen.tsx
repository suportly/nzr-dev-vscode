import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import FileTree from '../components/FileTree';
import { useConnection } from '../contexts/ConnectionContext';
import { vscodeAPI, FileEntry } from '../services/vscode-api';
import type { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Files screen with file browser and search
 */
export default function FilesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isConnected } = useConnection();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Handle file selection - open in editor
  const handleFileSelect = useCallback(
    (file: FileEntry) => {
      navigation.navigate('Editor', { filePath: file.path });
    },
    [navigation]
  );

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results = await vscodeAPI.searchFiles(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Handle search result selection
  const handleSearchResultSelect = useCallback(
    (file: FileEntry) => {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      navigation.navigate('Editor', { filePath: file.path });
    },
    [navigation]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.disconnectedText}>Not connected to VSCode</Text>
        <Text style={styles.hintText}>Connect to a workspace first</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        {showSearch ? (
          <View style={styles.searchInputContainer}>
            <IconButton
              icon="arrow-left"
              size={20}
              iconColor="#CCCCCC"
              onPress={clearSearch}
            />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              placeholder="Search files..."
              placeholderTextColor="#666666"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {searching ? (
              <ActivityIndicator size="small" color="#007ACC" style={styles.searchIcon} />
            ) : (
              <IconButton
                icon="magnify"
                size={20}
                iconColor="#007ACC"
                onPress={handleSearch}
              />
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => setShowSearch(true)}
          >
            <IconButton icon="magnify" size={20} iconColor="#CCCCCC" />
            <Text style={styles.searchButtonText}>Search files...</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results or File Tree */}
      {showSearch && searchResults.length > 0 ? (
        <View style={styles.searchResults}>
          <Text style={styles.searchResultsTitle}>
            {searchResults.length} results
          </Text>
          {searchResults.map((file) => (
            <TouchableOpacity
              key={file.path}
              style={styles.searchResultItem}
              onPress={() => handleSearchResultSelect(file)}
            >
              <IconButton
                icon={file.type === 'directory' ? 'folder' : 'file-document-outline'}
                size={20}
                iconColor={file.type === 'directory' ? '#DCAD56' : '#8B8B8B'}
              />
              <View style={styles.searchResultContent}>
                <Text style={styles.searchResultName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={styles.searchResultPath} numberOfLines={1}>
                  {file.path}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <FileTree onFileSelect={handleFileSelect} />
      )}
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
  searchBar: {
    backgroundColor: '#252526',
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  searchButtonText: {
    fontSize: 14,
    color: '#666666',
    marginLeft: 4,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchResults: {
    flex: 1,
    padding: 8,
  },
  searchResultsTitle: {
    fontSize: 12,
    color: '#8B8B8B',
    marginBottom: 8,
    marginLeft: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  searchResultContent: {
    flex: 1,
    marginLeft: 4,
  },
  searchResultName: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  searchResultPath: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
});
