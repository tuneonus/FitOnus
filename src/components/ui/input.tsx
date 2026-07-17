import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { Text } from './text';
import { useTheme } from '@/hooks/use-theme';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';

export interface InputProps extends TextInputProps {
  label?: string | undefined;
  error?: string | undefined;
  helperText?: string | undefined;
  containerStyle?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = ({
  label,
  error,
  helperText,
  containerStyle,
  leftIcon,
  rightIcon,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) => {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const borderColor = error
    ? colors.error
    : isFocused
    ? colors.borderFocused
    : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text variant="labelMedium" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      )}
      
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.backgroundElement,
            borderColor,
            borderWidth: isFocused || error ? 2 : 1,
          },
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        
        <TextInput
          style={[
            styles.input,
            { color: colors.text, ...Typography.bodyLarge },
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
        
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>

      {error ? (
        <Text variant="bodySmall" color="error" style={styles.helperText}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="bodySmall" color="textTertiary" style={styles.helperText}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  leftIcon: {
    marginRight: Spacing.sm,
  },
  rightIcon: {
    marginLeft: Spacing.sm,
  },
  helperText: {
    marginTop: Spacing.xs,
  },
});
