import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { PasswordField } from '../components/PasswordField';
import { PasswordStrength } from '../components/PasswordStrength';
import { authService } from '../services/authService';
import { passwordStrength } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';
import { AuthHeader } from '../components/AuthHeader';

export function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();
  const params = useRouteParams<{ token?: string }>();

  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const tokenMissing = !token.trim();
  const weak = passwordStrength(password).score < 3 || password.length < 12;
  const mismatch = confirm !== password;

  const handleSubmit = async () => {
    setSubmitted(true);
    setApiError(null);
    if (tokenMissing || weak || mismatch) return;

    setLoading(true);
    const result = await authService.resetPassword({
      token: token.trim(),
      newPassword: password,
    });
    setLoading(false);

    if (!result.ok) {
      setApiError(result.error);
      return;
    }

    reset('authSuccess');
  };

  return (
    <Screen showBack={true} keyboardAvoiding={true}>
      <View style={styles.content}>
        <AuthHeader
          title="Choose a new password"
          subtitle="You’ll use it to log in on all your devices."
        />

        {apiError ? (
          <View style={styles.bannerWrap}>
            <StatusBanner tone="error" title="Password reset failed" body={apiError} />
          </View>
        ) : null}

        <View style={styles.inputsSection}>
          {!params.token ? (
            <TextField
              label="Reset token / code"
              placeholder="Paste the reset code from your email"
              value={token}
              onChangeText={(t) => {
                setToken(t);
                setApiError(null);
              }}
              error={submitted && tokenMissing ? 'Reset token is required.' : undefined}
            />
          ) : null}

          <View>
            <PasswordField
              label="New password"
              value={password}
              onChange={(p) => {
                setPassword(p);
                setApiError(null);
              }}
              error={
                submitted && weak ? 'Password must be at least 12 characters and meet strength requirements.' : undefined
              }
            />
            <PasswordStrength password={password} />
          </View>

          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={(c) => {
              setConfirm(c);
              setApiError(null);
            }}
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
    paddingTop: 8,
  },
  bannerWrap: {
    marginTop: 16,
  },
  inputsSection: {
    marginTop: 24,
    gap: 16,
  },
  submitButton: {
    marginTop: 28,
  },
});

