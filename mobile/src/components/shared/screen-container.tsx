import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: readonly ('top' | 'right' | 'bottom' | 'left')[];
  backgroundColor?: string;
}

export const ScreenContainer = ({ 
  children, 
  style, 
  edges = ['right', 'bottom', 'left'], // Default to not applying top inset if there's a Header
  backgroundColor 
}: ScreenContainerProps) => {
  const { colors } = useTheme();
  
  return (
    <SafeAreaView 
      style={[
        styles.container, 
        { backgroundColor: backgroundColor || colors.background }, 
        style
      ]}
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
