import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { TextField } from '../../../shared/components/ui/TextField';
import { useTheme } from '@/hooks/use-theme';

export type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  autoComplete?: string | undefined;
};

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
}: PasswordFieldProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      placeholder={placeholder}
      secureTextEntry={!visible}
      value={value}
      onChangeText={onChange}
      error={error}
      hint={hint}
      autoCapitalize="none"
      trailing={
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((v) => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.eyeButton}
        >
          {visible ? (
            <EyeOff size={18} color={colors.muted} />
          ) : (
            <Eye size={18} color={colors.muted} />
          )}
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  eyeButton: {
    padding: 6,
  },
});
