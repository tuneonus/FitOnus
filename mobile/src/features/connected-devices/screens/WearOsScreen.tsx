import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Bell, CircleDot, HeartPulse, Timer, Watch } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';

const planned = [
  {
    icon: HeartPulse,
    title: 'Heart rate, steps and sleep',
    body: 'Read through Health Connect from Pixel Watch, Galaxy Watch and other Wear OS devices.',
  },
  {
    icon: Timer,
    title: 'Workout tiles',
    body: 'Start today’s plan and log sets from your wrist.',
  },
  {
    icon: Bell,
    title: 'Wrist reminders',
    body: 'Rest timer haptics, water and walk nudges.',
  },
];

export function WearOsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  return (
    <Screen title="Wear OS" contentContainerStyle={styles.container}>
      {/* Future Preview Header Card */}
        <View style={[styles.previewCard, { borderColor: colors.line }]}>
          <View style={styles.cardTopRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surface2 }]}>
              <Watch size={22} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Wear OS companion</Text>
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                Planned · not available yet
              </Text>
            </View>
            <Badge>Future</Badge>
          </View>

          <Text style={[styles.cardDescription, { color: colors.ink }]}>
            Today, data from a Wear OS watch reaches FitOnus if the watch’s app (e.g. Fitbit, Samsung Health) shares it with Health Connect.
          </Text>

          <Button
            variant="secondary"
            fullWidth
            onPress={() => navigate('healthIntegration')}
          >
            Check Health Connect
          </Button>
        </View>

        {/* What's Planned */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>What’s planned</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {planned.map((p, idx) => {
              const Icon = p.icon;
              return (
                <View
                  key={p.title}
                  style={[
                    styles.plannedRow,
                    { borderBottomColor: colors.line },
                    idx === planned.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Icon size={18} color={colors.muted} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.plannedTitle, { color: colors.ink }]}>{p.title}</Text>
                    <Text style={[styles.plannedBody, { color: colors.muted }]}>{p.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Note */}
        <View style={styles.noteRow}>
          <CircleDot size={14} color={colors.muted} style={{ marginTop: 2 }} />
          <Text style={[styles.noteText, { color: colors.muted }]}>
            Wear OS data uses the same normalized health model as Apple Watch, so screens won’t change when support ships.
          </Text>
        </View>

        <Button
          fullWidth
          variant="outline"
          onPress={() =>
            showToast({ message: 'We’ll notify you when Wear OS support launches' })
          }
        >
          Notify me
        </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  previewCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 20,
    gap: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 13,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  plannedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  plannedTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  plannedBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 8,
  },
  noteText: {
    fontSize: 12.5,
    lineHeight: 17,
    flex: 1,
  },
});

