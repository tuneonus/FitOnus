import React from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Dumbbell, Sparkles, Utensils } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { Button } from '../../../shared/components/ui/Button';
import { images } from '../../../shared/constants/images';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

const pillars = [
  { icon: Dumbbell, label: 'Training' },
  { icon: Utensils, label: 'Nutrition' },
  { icon: Sparkles, label: 'AI coach' },
] as const;

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  return (
    <View style={[styles.container, { backgroundColor: colors.hero }]}>
      {/* Full-bleed photo that fades into the brand surface behind the content. */}
      <View style={styles.photoWrap} pointerEvents="none">
        <Image source={images.welcomeHero} style={styles.photo} resizeMode="cover" />
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
          viewBox="0 0 1 1"
        >
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.hero} stopOpacity="0.55" />
              <Stop offset="0.28" stopColor={colors.hero} stopOpacity="0" />
              <Stop offset="0.62" stopColor={colors.hero} stopOpacity="0.35" />
              <Stop offset="1" stopColor={colors.hero} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill="url(#fade)" />
        </Svg>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top + 12, 40),
            paddingBottom: Math.max(insets.bottom + 16, 28),
          },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Logo size={40} withWordmark tone="hero" />

        <View style={styles.spacer} />

        <View>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>OWN YOUR FITNESS.</Text>
          <Text accessibilityRole="header" style={[styles.headline, { color: colors.heroInk }]}>
            Train with intent.{'\n'}Eat with purpose.{'\n'}See real progress.
          </Text>
          <Text style={[styles.subheadline, { color: colors.heroMuted }]}>
            Workouts, meals and progress in one place — with an AI coach that answers in plain
            language.
          </Text>

          <View style={styles.pillars}>
            {pillars.map(({ icon: Icon, label }) => (
              <View
                key={label}
                style={[styles.pillar, { backgroundColor: 'rgba(244, 244, 238, 0.08)' }]}
              >
                <Icon size={15} color={colors.accent} strokeWidth={2.2} />
                <Text style={[styles.pillarText, { color: colors.heroInk }]}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.buttonStack}>
            <Button title="Get started" size="lg" fullWidth onPress={() => navigate('signup')} />
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('login')}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: 'rgba(244, 244, 238, 0.22)',
                  backgroundColor: pressed ? 'rgba(244, 244, 238, 0.08)' : 'transparent',
                },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.heroInk }]}>
                I already have an account
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.legalText, { color: colors.heroMuted }]}>
            By continuing you agree to our Terms and Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  photoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '30%',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  spacer: {
    flex: 1,
    minHeight: 180,
  },
  eyebrow: {
    ...premium.type.eyebrow,
    letterSpacing: 2,
    marginBottom: 12,
  },
  headline: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  subheadline: {
    ...premium.type.body,
    marginTop: 14,
  },
  pillars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
  },
  pillar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pillarText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttonStack: {
    marginTop: 28,
    gap: 10,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 18,
  },
});
