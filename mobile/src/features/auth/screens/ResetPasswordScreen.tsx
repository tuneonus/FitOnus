import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { PasswordField } from '../components/PasswordField';
import { PasswordStrength } from '../components/PasswordStrength';
import { authService } from '../services/authService';
import { passwordStrength } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';

export function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const weak = passwordStrength(password).score < 3;
  const mismatch = confirm !== password;

  const handleSubmit = async () => {
    setSubmitted(true);
    if (weak || mismatch) return;

    setLoading(true);
    await authService.resetPassword();
    setLoading(false);
    reset('authSuccess');
  };

  return (
    <Screen showBack={true} keyboardAvoiding={true}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }]}>
          Choose a new password
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          You’ll use it to log in on all your devices.
        </Text>

        <View style={styles.inputsSection}>
          <View>
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              error={
                submitted && weak ? 'Meet all requirements below.' : undefined
              }
            />
            <PasswordStrength password={password} />
          </View>

          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            error={
              submitted && mismatch ? 'Passwords don’t match.' : undefined
            }
          />
        </View>

        <Button
          title={loading ? 'Updating…' : 'Update password'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
          style={styles.submitButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  inputsSection: {
    marginTop: 24,
    gap: 16,
  },
  submitButton: {
    marginTop: 28,
  },
});

