import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { Button } from '../../../shared/components/ui/Button';
import { images } from '../../../shared/constants/images';
import { useTheme } from '@/hooks/use-theme';

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  return (
    <View style={[styles.container, { backgroundColor: colors.hero }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        <View style={styles.imageContainer}>
          <Image
            source={images.welcomeHero}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={[styles.logoOverlay, { top: Math.max(insets.top + 8, 48) }]}>
            <Logo size={38} withWordmark tone="hero" />
          </View>
        </View>

        {/* Content Section */}
        <View
          style={[
            styles.contentSection,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <Text style={[styles.headline, { color: colors.heroInk }]}>
            A coach that reads your body, not just your steps.
          </Text>
          <Text style={[styles.subheadline, { color: colors.heroMuted }]}>
            FitOnus turns sleep, recovery, training and meals into one clear plan
            — and answers your questions in plain language.
          </Text>

          <View style={styles.buttonStack}>
            <Button
              title="Create account"
              size="lg"
              fullWidth
              onPress={() => navigate('signup')}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigate('login')}
              style={[
                styles.secondaryButton,
                { borderColor: 'rgba(244, 244, 238, 0.2)' },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.heroInk }]}>
                I already have an account
              </Text>
            </TouchableOpacity>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  imageContainer: {
    flex: 1,
    minHeight: 280,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  logoOverlay: {
    position: 'absolute',
    left: 20,
  },
  contentSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  subheadline: {
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 10,
  },
  buttonStack: {
    marginTop: 24,
    gap: 10,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  legalText: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 16,
  },
});

