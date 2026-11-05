import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Scale, Droplets, Dumbbell, X } from 'lucide-react-native';

export default function QuickLogModal() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      <BlurView 
        intensity={isDark ? 40 : 20} 
        tint={isDark ? 'dark' : 'light'} 
        style={StyleSheet.absoluteFill} 
      />
      
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      
      <View style={[styles.content, { backgroundColor: colors.background, shadowColor: '#000000' }]}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={{ color: colors.text }}>Quick Log</Text>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <X size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          <Pressable 
            style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
            onPress={() => {
              console.log('Log Weight');
              router.back();
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Scale size={28} color={colors.primary} />
            </View>
            <Text variant="labelLarge" style={{ color: colors.text, marginTop: Spacing.sm }}>Weight</Text>
          </Pressable>

          <Pressable 
            style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
            onPress={() => {
              console.log('Log Water');
              router.back();
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}>
              <Droplets size={28} color="#0284C7" />
            </View>
            <Text variant="labelLarge" style={{ color: colors.text, marginTop: Spacing.sm }}>Water</Text>
          </Pressable>

          <Pressable 
            style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
            onPress={() => {
              console.log('Start Workout');
              router.back();
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FCE7F3' }]}>
              <Dumbbell size={28} color="#DB2777" />
            </View>
            <Text variant="labelLarge" style={{ color: colors.text, marginTop: Spacing.sm }}>Workout</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    elevation: 20,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
