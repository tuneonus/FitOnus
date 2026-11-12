import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle } from 'react-native';
import { premium } from '@/shared/theme/premium';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  appearance?: 'default' | 'premium';
  label?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  trailing?: React.ReactNode | undefined;
  suffix?: string | undefined;
  hideLabel?: boolean | undefined;
  style?: ViewStyle | undefined;
};

export function TextField({
  appearance = 'default',
  label,
  error,
  hint,
  trailing,
  suffix,
  hideLabel = false,
  style,
  ...inputProps
}: TextFieldProps) {
  const { colors, isDark } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const defaultPlaceholderColor = isDark ? 'rgba(164, 166, 154, 0.6)' : 'rgba(92, 93, 86, 0.6)';

  return (
    <View style={[styles.wrapper, style]}>
      {!hideLabel && !!label && <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isFocused ? colors.surface : colors.surface2,
            ...(appearance === 'premium'
              ? { minHeight: 56, height: undefined, borderRadius: premium.radius.control }
              : {}),
            borderColor: error ? colors.bad : isFocused ? colors.accentStrong : 'transparent',
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            appearance === 'premium' && { minHeight: 52, height: undefined, paddingVertical: 12 },
            { color: colors.ink },
          ]}
          placeholderTextColor={inputProps.placeholderTextColor ?? defaultPlaceholderColor}
          {...inputProps}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          onFocus={(event) => {
            setIsFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            inputProps.onBlur?.(event);
          }}
        />

        {suffix ? <Text style={[styles.suffix, { color: colors.muted }]}>{suffix}</Text> : null}

        {trailing}
      </View>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.bad }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  inputContainer: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    paddingVertical: 0,
  },
  suffix: {
    fontSize: 14,
    marginLeft: 8,
  },
  error: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 6,
    marginLeft: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
