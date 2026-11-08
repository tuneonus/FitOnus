import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

const barScales = [0.35, 0.6, 0.9, 0.5, 1, 0.7, 0.4, 0.85, 0.55, 0.95, 0.45, 0.7, 0.3];

export function VoiceWaveform({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const [anims] = useState(() => barScales.map(() => new Animated.Value(6)));

  useEffect(() => {
    if (!active) {
      anims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 6,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    const loops = anims.map((anim, i) => {
      const targetHeight = (barScales[i] ?? 0.5) * 60;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 50),
          Animated.timing(anim, {
            toValue: targetHeight,
            duration: 350,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 8,
            duration: 350,
            useNativeDriver: false,
          }),
        ])
      );
    });

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [active, anims]);

  return (
    <View style={styles.container}>
      {barScales.map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: colors.accent,
              height: anims[i],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bar: {
    width: 5,
    borderRadius: 3,
  },
});

