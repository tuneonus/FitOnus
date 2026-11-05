import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  trailing?: React.ReactNode | undefined;
  suffix?: string | undefined;
  hideLabel?: boolean | undefined;
  style?: ViewStyle | undefined;
};

export function TextField({
  label,
  error,
  hint,
  trailing,
  suffix,
  hideLabel = false,
  style,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      {!hideLabel && !!label && (
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      )}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderColor: error
              ? colors.bad
              : isFocused
              ? colors.ink
              : colors.line,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.ink }]}
          placeholderTextColor="rgba(92, 93, 86, 0.6)"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...inputProps}
        />

        {suffix ? (
          <Text style={[styles.suffix, { color: colors.muted }]}>{suffix}</Text>
        ) : null}

        {trailing}
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.bad }]}>{error}</Text>
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
    marginBottom: 6,
    letterSpacing: -0.1,
  },
  inputContainer: {
    height: 52,
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
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
