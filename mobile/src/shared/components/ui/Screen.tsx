import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
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
import { premium } from '@/shared/theme/premium';

export type ScreenProps = {
  title?: string;
  largeTitle?: string;
  subtitle?: string;
  /** Small uppercase kicker above a large page title. */
  eyebrow?: string;
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
  eyebrow,
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

  // Tab roots present a large, left-aligned page title; pushed screens use a compact bar.
  const pageTitle = largeTitle ?? (!backVisible && !headerLeft && title ? title : undefined);
  const barTitle = pageTitle === title ? undefined : title;
  const inlineActions = !largeTitle && pageTitle && !backVisible ? headerRight : undefined;
  const showBar = Boolean(barTitle || backVisible || headerLeft || (headerRight && !inlineActions));

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <StatusBar barStyle={isHero || isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        {showBar && (
          <View style={styles.topBar}>
            <View style={styles.headerSide}>
              {backVisible ? (
                <Pressable
                  onPress={handleBack}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  style={({ pressed }) => [
                    styles.backButton,
                    {
                      backgroundColor: isHero ? 'rgba(244, 244, 238, 0.1)' : colors.surface,
                      borderColor: isHero ? 'transparent' : colors.line,
                      opacity: pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ChevronLeft size={22} color={textColor} strokeWidth={2.2} />
                </Pressable>
              ) : (
                headerLeft
              )}
            </View>

            <View style={styles.headerCenter}>
              {barTitle ? (
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: textColor }]}
                  numberOfLines={1}
                >
                  {barTitle}
                </Text>
              ) : null}
              {barTitle && subtitle && !largeTitle ? (
                <Text style={[styles.barSubtitle, { color: mutedTextColor }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <View style={[styles.headerSide, styles.headerSideRight]}>
              {inlineActions ? null : headerRight}
            </View>
          </View>
        )}

        {pageTitle ? (
          <View style={[styles.largeTitleSection, !showBar && styles.largeTitleSectionTop]}>
            <View style={styles.largeTitleRow}>
              <View style={styles.largeTitleText}>
                {eyebrow ? (
                  <Text style={[styles.eyebrow, { color: mutedTextColor }]}>{eyebrow}</Text>
                ) : null}
                <Text
                  accessibilityRole="header"
                  style={[styles.largeTitle, { color: textColor }]}
                  numberOfLines={2}
                >
                  {pageTitle}
                </Text>
              </View>
              {inlineActions ? <View style={styles.inlineActions}>{inlineActions}</View> : null}
            </View>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: mutedTextColor }]}>{subtitle}</Text>
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
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  headerSide: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...premium.type.cardTitle,
    textAlign: 'center',
  },
  barSubtitle: {
    ...premium.type.caption,
    textAlign: 'center',
  },
  largeTitleSection: {
    paddingHorizontal: premium.layout.gutter,
    paddingTop: 4,
    paddingBottom: 16,
  },
  largeTitleSectionTop: {
    paddingTop: 12,
  },
  largeTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  largeTitleText: {
    flex: 1,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 2,
  },
  eyebrow: {
    ...premium.type.eyebrow,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  largeTitle: {
    ...premium.type.screenTitle,
  },
  subtitle: {
    ...premium.type.bodySm,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: premium.layout.gutter,
    paddingTop: 8,
  },
  fixedContent: {
    flex: 1,
    paddingHorizontal: premium.layout.gutter,
    paddingTop: 8,
  },
  footerContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: premium.layout.gutter,
    paddingTop: 12,
  },
});
