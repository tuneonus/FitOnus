import React, { useState } from 'react';

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { PasswordField } from '../components/PasswordField';
import { AuthHeader, AuthSwitchPrompt } from '../components/AuthHeader';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';
import { profileApi } from '@/features/profile/api/profile-api';

export function LoginScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failures, setFailures] = useState(0);

  const handleSubmit = async () => {
    const nextErrors: typeof errors = {};
    if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    setAuthError(null);

    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    const res = await authService.login(email.trim(), password);
    setLoading(false);

    if (res.ok) {
      try {
        const p = await profileApi.getProfile();
        if (p?.onboardingCompleted) {
          return reset('home');
        }
      } catch {
        // Fallback to onboarding if profile check fails
      }
      return reset('onboarding');
    }

    if (failures + 1 >= 3) {
      setFailures(0);
      return navigate('authError', { reason: 'locked' });
    }

    const nextFailures = failures + 1;
    setFailures(nextFailures);
    setAuthError(
      `${res.error} ${3 - nextFailures} attempt${3 - nextFailures === 1 ? '' : 's'} left.`
    );
  };

  return (
    <Screen showBack={true} keyboardAvoiding={true}>
      <View style={styles.content}>
        <AuthHeader
          title="Welcome back"
          subtitle="Log in to pick up your training, meals and progress."
        />

        {authError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t log you in"
            body={authError}
            style={styles.banner}
          />
        ) : null}

        <View style={styles.inputsSection}>
          <TextField
            label="Email"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
          />

          <PasswordField
            label="Password"
            placeholder="Enter password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigate('forgotPassword')}
          style={styles.forgotLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.forgotText, { color: colors.accentStrong }]}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        <Button
          title={loading ? 'Logging in…' : 'Log in'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
          style={styles.loginButton}
        />

        <AuthSwitchPrompt
          prompt="Don’t have an account?"
          action="Create one"
          onPress={() => navigate('signup')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  banner: {
    marginTop: 16,
  },
  inputsSection: {
    marginTop: 24,
    gap: 10,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 6,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '700',
  },
  loginButton: {
    marginTop: 20,
  },
});
