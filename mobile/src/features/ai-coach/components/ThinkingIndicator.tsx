import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Check } from 'lucide-react-native';
import { toolLabels } from '../services/aiToolContracts';
import type { ToolName } from '../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function ThinkingIndicator({ toolCalls = [] }: { toolCalls?: ToolName[] | undefined }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (step >= toolCalls.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 480);
    return () => clearTimeout(t);
  }, [step, toolCalls.length]);

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 150);
    const a3 = pulse(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.container}>
      {toolCalls.map((tool, i) => (
        <View key={tool} style={styles.toolRow}>
          {i < step ? (
            <Check size={14} color={colors.good} />
          ) : (
            <ActivityIndicator size="small" color={colors.muted} style={{ transform: [{ scale: 0.7 }] }} />
          )}
          <Text style={[styles.toolText, { color: colors.muted }]}>
            {toolLabels[tool] || tool}
          </Text>
        </View>
      ))}

      {step >= toolCalls.length && (
        <View style={styles.dotsRow}>
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.ink, opacity: dot1 },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.ink, opacity: dot2 },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.ink, opacity: dot3 },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolText: {
    fontSize: 13,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
