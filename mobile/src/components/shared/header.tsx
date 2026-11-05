import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface HeaderProps {
  title?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}

export const Header = ({ title, leftElement, rightElement, onBack, showBack }: HeaderProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.innerContainer}>
        <View style={styles.leftContainer}>
          {showBack && onBack ? (
            <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
              <Text color="primary" variant="bodyLarge">Back</Text>
            </Pressable>
          ) : leftElement}
        </View>

        <View style={styles.titleContainer}>
          {title && (
            <Text variant="headlineMedium" color="text" align="center" numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        <View style={styles.rightContainer}>
          {rightElement}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    zIndex: 10,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: Spacing.lg,
  },
  leftContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  rightContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  titleContainer: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    padding: Spacing.xs,
  },
});
