import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MailCheck } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { authService } from '../services/authService';
import { isValidEmail, RESEND_COOLDOWN_SECONDS } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';
import { AuthHeader } from '../components/AuthHeader';

export function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Counts down the resend cooldown (the server enforces the same 60 seconds).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      return setError('Enter the email you signed up with.');
    }
    setError(undefined);
    setLoading(true);
    const res = await authService.requestReset(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (sent) {
    return (
      <Screen showBack={true}>
        <View style={styles.sentContainer}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.accentSoft },
            ]}
          >
            <MailCheck size={32} color={colors.accentStrong} />
          </View>

          <Text style={[styles.titleCenter, { color: colors.ink }]}>
            Check your inbox
          </Text>
          <Text style={[styles.subtitleCenter, { color: colors.muted }]}>
            If an account exists for{' '}
            <Text style={{ fontWeight: '600', color: colors.ink }}>{email}</Text>,
            we have sent a 6-digit verification code. It expires in 5 minutes.
          </Text>

          <Button
            title="Enter verification code"
            size="lg"
            fullWidth
            onPress={() => navigate('resetPassword', { email: email.trim().toLowerCase() })}
            style={styles.openButton}
          />
          <Button
            title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            variant="ghost"
            fullWidth
            disabled={cooldown > 0 || loading}
            loading={loading}
            onPress={handleSubmit}
            style={styles.diffButton}
          />
          <Button
            title="Use a different email"
            variant="ghost"
            fullWidth
            onPress={() => setSent(false)}
            style={styles.diffButton}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen showBack={true} keyboardAvoiding={true}>
      <View style={styles.content}>
        <AuthHeader
          title="Reset password"
          subtitle="Enter the email on your account and we’ll send you a 6-digit verification code."
        />

        <TextField
          label="Email"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          error={error}
          style={styles.input}
        />

        <Button
          title={loading ? 'Sending…' : 'Send code'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
          style={styles.sendButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  input: {
    marginTop: 24,
  },
  sendButton: {
    marginTop: 20,
  },
  sentContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  titleCenter: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitleCenter: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  openButton: {
    marginTop: 32,
  },
  diffButton: {
    marginTop: 10,
  },
});

