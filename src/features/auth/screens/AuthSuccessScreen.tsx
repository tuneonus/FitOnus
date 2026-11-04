import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { useTheme } from '@/hooks/use-theme';

export function AuthSuccessScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
        <Check size={36} color={colors.accentInk} strokeWidth={2.6} />
      </View>

      <Text style={[styles.title, { color: colors.ink }]}>Password updated</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        You’ve been signed out of other devices for safety. Log in with your new
        password.
      </Text>

      <Button
        title="Log in"
        size="lg"
        fullWidth
        onPress={() => reset('login')}
        style={styles.loginButton}
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
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  loginButton: {
    marginTop: 32,
  },
});

