import React, { useState } from 'react';

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { PasswordField } from '../components/PasswordField';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();

  const [email, setEmail] = useState('aarav.mehta@gmail.com');
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
    const res = await authService.login(email, password);
    setLoading(false);

    if (res.ok) {
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
    <Screen showBack={true}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Log in to pick up where your coach left off.
        </Text>

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
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
          />

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
        </View>

        <TouchableOpacity
          onPress={() => navigate('forgotPassword')}
          style={styles.forgotLink}
        >
          <Text style={[styles.forgotText, { color: colors.ink }]}>
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

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
          <Text style={[styles.dividerText, { color: colors.muted }]}>
            or continue with
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
        </View>

        {/* Social Buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => reset('home')}
            style={[
              styles.socialButton,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
          >
            <Text style={[styles.socialText, { color: colors.ink }]}>
              Apple
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => reset('home')}
            style={[
              styles.socialButton,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
          >
            <Text style={[styles.socialText, { color: colors.ink }]}>
              Google
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign up prompt */}
        <View style={styles.signupPrompt}>
          <Text style={{ color: colors.muted }}>Don’t have an account? </Text>
          <TouchableOpacity onPress={() => navigate('signup')}>
            <Text style={[styles.signupLink, { color: colors.ink }]}>
              Create one
            </Text>
          </TouchableOpacity>
        </View>
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
  banner: {
    marginTop: 16,
  },
  inputsSection: {
    marginTop: 20,
    gap: 12,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  loginButton: {
    marginTop: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialText: {
    fontSize: 15,
    fontWeight: '600',
  },
  signupPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  signupLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
