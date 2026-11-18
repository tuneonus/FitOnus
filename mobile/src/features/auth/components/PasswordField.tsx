import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, type TextInputInstance } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { TextField, type TextFieldProps } from '../../../shared/components/ui/TextField';
import { useTheme } from '@/hooks/use-theme';

export type PasswordFieldProps = Omit<TextFieldProps, 'trailing' | 'secureTextEntry' | 'onChange'> & {
  onChange?: (value: string) => void;
};

export const PasswordField = React.forwardRef<TextInputInstance, PasswordFieldProps>(({
  label,
  value,
  onChange,
  onChangeText,
  placeholder,
  error,
  hint,
  ...rest
}, ref) => {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      ref={ref}
      label={label}
      placeholder={placeholder}
      secureTextEntry={!visible}
      value={value}
      onChangeText={onChangeText ?? onChange}
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
      {...rest}
    />
  );
});

PasswordField.displayName = 'PasswordField';

const styles = StyleSheet.create({
  eyeButton: {
    padding: 6,
  },
});
