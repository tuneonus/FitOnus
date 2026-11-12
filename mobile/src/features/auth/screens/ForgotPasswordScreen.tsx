import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MailCheck } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';
import { AuthHeader } from '../components/AuthHeader';

export function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
            we have sent instructions to reset your password. It expires in 30 minutes.
          </Text>

          <Button
            title="I have a reset code / token"
            size="lg"
            fullWidth
            onPress={() => navigate('resetPassword')}
            style={styles.openButton}
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
          subtitle="Enter the email on your account and we’ll send you a secure reset link."
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
          title={loading ? 'Sending…' : 'Send reset link'}
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

