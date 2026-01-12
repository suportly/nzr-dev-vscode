import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Button } from 'react-native-paper';

/**
 * Error boundary props
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

/**
 * Error boundary state
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component to catch and handle React errors
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The app encountered an unexpected error
            </Text>

            {this.state.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Error</Text>
                <Text style={styles.errorMessage}>
                  {this.state.error.message}
                </Text>
              </View>
            )}

            {__DEV__ && this.state.errorInfo && (
              <ScrollView style={styles.stackContainer}>
                <Text style={styles.stackTitle}>Stack Trace (Dev Only)</Text>
                <Text style={styles.stackTrace}>
                  {this.state.errorInfo.componentStack}
                </Text>
              </ScrollView>
            )}

            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={this.handleReset}
                style={styles.button}
              >
                Try Again
              </Button>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for error boundary (functional component wrapper)
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F44747',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8B8B8B',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F44747',
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44747',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  errorMessage: {
    fontSize: 13,
    color: '#CCCCCC',
    fontFamily: 'monospace',
  },
  stackContainer: {
    width: '100%',
    maxHeight: 200,
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  stackTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A9955',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  stackTrace: {
    fontSize: 10,
    color: '#8B8B8B',
    fontFamily: 'monospace',
  },
  actions: {
    width: '100%',
  },
  button: {
    backgroundColor: '#007ACC',
  },
});

export default ErrorBoundary;
