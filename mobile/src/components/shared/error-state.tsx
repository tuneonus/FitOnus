import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '../ui/text';
import { Button } from '../ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState = ({ 
  title = 'Something went wrong', 
  message = 'An error occurred while loading this content. Please try again.',
  onRetry, 
  style 
}: ErrorStateProps) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text variant="headlineMedium" color="text" align="center" style={styles.title}>
        {title}
      </Text>
      
      <Text variant="bodyLarge" color="textSecondary" align="center" style={styles.message}>
        {message}
      </Text>
      
      {onRetry && (
        <Button 
          title="Try Again" 
          onPress={onRetry} 
          variant="outline" 
          style={styles.button}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  message: {
    marginBottom: Spacing.xl,
  },
  button: {
    minWidth: 120,
  },
});
