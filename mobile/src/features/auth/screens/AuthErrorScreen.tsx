import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock, WifiOff, Clock } from 'lucide-react-native';
import {
  useNavigation,
  useRouteParams,
} from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { useTheme } from '@/hooks/use-theme';

const reasons = {
  locked: {
    icon: Lock,
    title: 'Account temporarily locked',
    body: 'Too many incorrect password attempts. For your security, sign-in is paused for 15 minutes. Resetting your password unlocks it right away.',
    primary: 'Reset password',
    route: 'forgotPassword' as const,
  },
  network: {
    icon: WifiOff,
    title: 'Couldn’t reach FitOnus',
    body: 'Check your internet connection and try again. Your data is safe.',
    primary: 'Try again',
    route: 'login' as const,
  },
  expired: {
    icon: Clock,
    title: 'This link has expired',
    body: 'Password reset links work for 30 minutes. Request a new one and use it soon after it arrives.',
    primary: 'Send a new link',
    route: 'forgotPassword' as const,
  },
};

export function AuthErrorScreen() {
  const { colors } = useTheme();
  const { reason = 'locked' } = useRouteParams();
  const { reset, replace } = useNavigation();

  const r = reasons[reason as keyof typeof reasons] ?? reasons.locked;
  const Icon = r.icon;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: 'rgba(214, 40, 40, 0.12)' },
        ]}
      >
        <Icon size={34} color={colors.bad} />
      </View>

      <Text style={[styles.title, { color: colors.ink }]}>{r.title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{r.body}</Text>

      <Button
        title={r.primary}
        size="lg"
        fullWidth
        onPress={() => replace(r.route)}
        style={styles.primaryButton}
      />
      <Button
        title="Back to start"
        size="lg"
        variant="ghost"
        fullWidth
        onPress={() => reset('welcome')}
        style={styles.ghostButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  primaryButton: {
    marginTop: 32,
  },
  ghostButton: {
    marginTop: 8,
  },
});

