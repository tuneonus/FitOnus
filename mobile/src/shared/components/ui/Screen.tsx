import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';

export type ScreenProps = {
  title?: string;
  largeTitle?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  tone?: 'default' | 'hero';
  scrollable?: boolean;
  refreshControl?: React.ReactElement;
  keyboardAvoiding?: boolean;
};

export function Screen({
  title,
  largeTitle,
  subtitle,
  showBack,
  onBack,
  headerLeft,
  headerRight,
  footer,
  children,
  contentContainerStyle,
  tone = 'default',
  scrollable = true,
  refreshControl,
  keyboardAvoiding = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { canGoBack, goBack, isTabRoot, route } = useNavigation();

  const isHero = tone === 'hero';
  const isTabScreen = ['home', 'activity', 'coach', 'progress', 'profile'].includes(route?.name);
  const hasBottomNav = isTabRoot || isTabScreen;
  const backVisible = showBack ?? (canGoBack && !isTabRoot && !isTabScreen);
  const hasBar = Boolean(title || backVisible || headerLeft || headerRight);

  const bgColor = isHero ? colors.hero : colors.bg;
  const textColor = isHero ? colors.heroInk : colors.ink;
  const mutedTextColor = isHero ? colors.heroMuted : colors.muted;

  const contentBottomPadding = footer
    ? 24
    : hasBottomNav
      ? Math.max(insets.bottom, 12) + 96
      : Math.max(insets.bottom + 20, 36);

  const footerBottomPadding = hasBottomNav
    ? Math.max(insets.bottom, 12) + 84
    : Math.max(insets.bottom, 16);

  const handleBack = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
    if (onBack) {
      onBack();
    } else {
      goBack();
    }
  }, [onBack, goBack]);

  const bodyContent = (
    <>
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: contentBottomPadding },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.fixedContent,
            { paddingBottom: contentBottomPadding },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}

      {footer && (
        <View
          style={[
            styles.footerContainer,
            {
              borderColor: isHero ? 'rgba(244, 244, 238, 0.1)' : colors.line,
              backgroundColor: bgColor,
              paddingBottom: footerBottomPadding,
            },
          ]}
        >
          {footer}
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <StatusBar
        barStyle={isHero || isDark ? 'light-content' : 'dark-content'}
      />

      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        {hasBar && (
          <View style={styles.topBar}>
            <View style={styles.headerSide}>
              {backVisible ? (
                <TouchableOpacity
                  onPress={handleBack}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  activeOpacity={0.7}
                  style={[
                    styles.backButton,
                    { backgroundColor: isHero ? 'rgba(244, 244, 238, 0.1)' : colors.surface2 },
                  ]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ChevronLeft size={24} color={textColor} />
                </TouchableOpacity>
              ) : (
                headerLeft
              )}
            </View>

            <View style={styles.headerCenter}>
              {title ? (
                <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
            </View>

            <View style={[styles.headerSide, styles.headerSideRight]}>
              {headerRight}
            </View>
          </View>
        )}

        {largeTitle ? (
          <View style={styles.largeTitleSection}>
            <Text style={[styles.largeTitle, { color: textColor }]}>
              {largeTitle}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: mutedTextColor }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {keyboardAvoiding || Boolean(footer) ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          {bodyContent}
        </KeyboardAvoidingView>
      ) : (
        bodyContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  headerContainer: {
    zIndex: 10,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerSide: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  largeTitleSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  fixedContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  footerContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
