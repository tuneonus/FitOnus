import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ArrowUpRight, Mic, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/shared/components/ui/Card';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { premium } from '@/shared/theme/premium';

export function CoachEntry() {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  return (
    <Card tone="muted" appearance="premium" style={styles.card}>
      <View style={styles.header}>
        <Sparkles size={17} color={colors.accentStrong} />
        <Text style={[premium.type.eyebrow, { color: colors.accentStrong }]}>ONUSFIT COACH</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        Your next move,{'\n'}made clearer.
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Talk through your training, meals and recovery with your AI Coach.
      </Text>
      <View style={styles.actions}>
        <ActionButton
          variant="inverse"
          title="Ask Coach"
          icon={ArrowUpRight}
          onPress={() => switchTab('coach')}
          style={styles.button}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Talk to your AI Coach by voice"
          onPress={() => navigate('voiceCoach')}
          style={({ pressed }) => [
            styles.voice,
            { borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Mic size={21} color={colors.ink} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...premium.type.title, marginTop: 16 },
  body: { ...premium.type.body, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  button: { flex: 1 },
  voice: {
    width: 52,
    minHeight: 48,
    borderRadius: premium.radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
