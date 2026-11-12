import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Logo } from '@/shared/components/common/Logo';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

type AuthHeaderProps = {
  title: string;
  subtitle?: string;
  /** Hide the brand mark when the screen already shows it. */
  showMark?: boolean;
};

/** Shared heading for every authentication form so the first impression stays consistent. */
export function AuthHeader({ title, subtitle, showMark = true }: AuthHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {showMark ? (
        <View style={styles.mark}>
          <Logo size={44} />
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** Inline "Prompt? Action" footer link used under auth forms. */
export function AuthSwitchPrompt({
  prompt,
  action,
  onPress,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.prompt}>
      <Text style={[styles.promptText, { color: colors.muted }]}>{prompt} </Text>
      <Text
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
        style={[styles.promptAction, { color: colors.accentStrong }]}
      >
        {action}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  mark: {
    marginBottom: 24,
  },
  title: {
    ...premium.type.screenTitle,
  },
  subtitle: {
    ...premium.type.body,
    marginTop: 8,
  },
  prompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 28,
    marginBottom: 16,
    minHeight: 44,
  },
  promptText: {
    fontSize: 14.5,
  },
  promptAction: {
    fontSize: 14.5,
    fontWeight: '700',
    paddingVertical: 10,
  },
});
