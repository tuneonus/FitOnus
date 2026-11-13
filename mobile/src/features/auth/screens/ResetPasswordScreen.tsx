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
import { isValidEmail, isValidOtp, OTP_LENGTH, passwordStrength, sanitizeOtp } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';
import { AuthHeader } from '../components/AuthHeader';

export function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();
  const params = useRouteParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const emailInvalid = !isValidEmail(email);
  const otpInvalid = !isValidOtp(otp);
  const weak = passwordStrength(password).score < 3 || password.length < 12;
  const mismatch = confirm !== password;

  const handleSubmit = async () => {
    setSubmitted(true);
    setApiError(null);
    if (emailInvalid || otpInvalid || weak || mismatch) return;

    setLoading(true);
    const result = await authService.resetPassword({
      email: email.trim(),
      otp,
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
          {!params.email ? (
            <TextField
              label="Email"
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setApiError(null);
              }}
              error={submitted && emailInvalid ? 'Enter the email you signed up with.' : undefined}
            />
          ) : null}

          <TextField
            label="6-digit code"
            placeholder="123456"
            hint="Enter the code we emailed you. It expires in 5 minutes."
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={OTP_LENGTH}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            value={otp}
            onChangeText={(t) => {
              setOtp(sanitizeOtp(t));
              setApiError(null);
            }}
            error={submitted && otpInvalid ? 'Enter the 6-digit code from your email.' : undefined}
          />

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

