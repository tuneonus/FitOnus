import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { useTheme } from '@/hooks/use-theme';

export function SplashScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();

  useEffect(() => {
    const t = setTimeout(() => reset('welcome'), 1600);
    return () => clearTimeout(t);
  }, [reset]);

  return (
    <View style={[styles.container, { backgroundColor: colors.hero }]}>
      <View style={styles.centerBox}>
        <Logo size={72} />
        <Text style={[styles.title, { color: colors.heroInk }]}>FitOnus</Text>
        <Text style={[styles.subtitle, { color: colors.heroMuted }]}>
          Your AI fitness & health coach
        </Text>
      </View>

      <View style={styles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: colors.accent }]}
          />
        ))}
      </View>

      <Text style={[styles.brandBottom, { color: colors.heroMuted }]}>
        by TuneOnus
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginTop: 20,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 56,
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  brandBottom: {
    position: 'absolute',
    bottom: 24,
    fontSize: 12,
  },
});

