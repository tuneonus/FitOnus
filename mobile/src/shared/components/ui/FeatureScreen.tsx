import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Keyboard } from 'react-native';
import { Screen, type ScreenProps } from './Screen';
import { premium } from '@/shared/theme/premium';
import { useTheme } from '@/hooks/use-theme';

/** Premium content presentation over the existing screen and gesture infrastructure. */
export function FeatureScreen({
  title,
  largeTitle,
  children,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <Screen
      {...props}
      keyboardAvoiding={props.keyboardAvoiding ?? true}
      contentContainerStyle={StyleSheet.flatten([styles.content, contentContainerStyle]) ?? {}}
    >
      {!keyboardOpen && (largeTitle || title) ? (
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            {largeTitle || title}
          </Text>
        </View>
      ) : null}
      {children}
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: {
    width: '100%' as const,
    maxWidth: premium.layout.maxWidth + premium.layout.gutter * 2,
    alignSelf: 'center',
    paddingHorizontal: premium.layout.gutter,
  },
  heading: { paddingTop: 8, paddingBottom: 24 },
  title: { ...premium.type.display },
});
