import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Timer, X, Plus, Minus } from 'lucide-react-native';

interface RestTimerProps {
  seconds: number;
  onSkip: () => void;
}

export const RestTimer = ({ seconds, onSkip }: RestTimerProps) => {
  const { colors } = useTheme();
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onSkip(); // Auto-skip when done
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, onSkip]);

  const adjustTime = (amount: number) => {
    setTimeLeft((prev) => Math.max(0, prev + amount));
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Timer size={18} color={colors.background} />
          <Text variant="labelLarge" style={{ color: colors.background, marginLeft: Spacing.sm }}>Rest Timer</Text>
        </View>
        <Pressable onPress={onSkip} style={styles.skipBtn}>
          <Text variant="labelMedium" style={{ color: colors.primary }}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.timeRow}>
        <Pressable onPress={() => adjustTime(-15)} style={[styles.adjustBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Minus size={24} color={colors.background} />
        </Pressable>
        
        <Text variant="headlineLarge" style={{ color: colors.background, fontSize: 48, fontVariant: ['tabular-nums'] }}>
          {formatTime(timeLeft)}
        </Text>
        
        <Pressable onPress={() => adjustTime(15)} style={[styles.adjustBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Plus size={24} color={colors.background} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginVertical: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skipBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adjustBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
