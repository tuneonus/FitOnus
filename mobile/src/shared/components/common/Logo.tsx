import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';

export type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  tone?: 'default' | 'hero';
};

export function Logo({
  size = 40,
  withWordmark = false,
  tone = 'default',
}: LogoProps) {
  const { colors } = useTheme();

  const textColor = tone === 'hero' ? colors.heroInk : colors.ink;
  const iconSize = size * 0.58;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: size * 0.3,
            backgroundColor: colors.accent,
          },
        ]}
      >
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 15h4l2.5-6 4 10 2.5-6H21"
            stroke={colors.accentInk}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      {withWordmark && (
        <Text style={[styles.wordmark, { color: textColor }]}>OnusFit</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});

