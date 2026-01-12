import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage keys used in the app
 */
export const STORAGE_KEYS = {
  CONNECTIONS: 'nzr_connections',
  AUTH_TOKEN: 'nzr_auth_token',
  REFRESH_TOKEN: 'nzr_refresh_token',
  DEVICE_ID: 'nzr_device_id',
  SETTINGS: 'nzr_settings',
  RECENT_FILES: 'nzr_recent_files',
} as const;

/**
 * AsyncStorage wrapper with typed operations
 */
class StorageService {
  /**
   * Store a string value
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error(`Failed to store ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a string value
   */
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error(`Failed to get ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove a value
   */
  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove ${key}:`, error);
      throw error;
    }
  }

  /**
   * Store a JSON object
   */
  async setJson<T>(key: string, value: T): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      console.error(`Failed to store JSON ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a JSON object
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(key);
      if (!jsonValue) return null;
      return JSON.parse(jsonValue) as T;
    } catch (error) {
      console.error(`Failed to parse JSON ${key}:`, error);
      return null;
    }
  }

  /**
   * Clear all app data
   */
  async clearAll(): Promise<void> {
    try {
      const keys = Object.values(STORAGE_KEYS);
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }

  /**
   * Get all stored keys
   */
  async getAllKeys(): Promise<readonly string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }
}

export const storage = new StorageService();
